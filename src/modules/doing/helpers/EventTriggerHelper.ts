import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { WorkflowTrigger } from "../models/index.js";
import { ExecutionHelper } from "./ExecutionHelper.js";
import { FilterMatcher } from "./FilterMatcher.js";
import { getMembershipModuleGateway, getGivingModuleGateway, getAttendanceModuleGateway } from "../../../shared/modules/index.js";

interface Subject {
  type: string;
  id?: string;
  label?: string;
}

// Canonical membership statuses (mirror B1Admin people/helpers/MembershipStatusOptions.ts).
const MEMBERSHIP_STATUS_OPTIONS = [
  { value: "Visitor", label: "Visitor" },
  { value: "Regular Attendee", label: "Regular Attendee" },
  { value: "Member", label: "Member" },
  { value: "Staff", label: "Staff" },
  { value: "Inactive", label: "Inactive" },
  { value: "Deceased", label: "Deceased" }
];

export interface TriggerFieldDef {
  key: string;
  label: string;
  type: "string" | "number" | "date" | "boolean" | "select";
  options?: { value: string; label: string }[];
  optionsSource?: string; // UI loads dynamic options (e.g. "funds", "groups")
}

export interface TriggerEventDef {
  eventType: string;
  label: string;
  recordType: string;
  fields: TriggerFieldDef[];
}

const PERSON_FIELDS: TriggerFieldDef[] = [
  { key: "person.membershipStatus", label: "Membership Status", type: "select", options: MEMBERSHIP_STATUS_OPTIONS },
  { key: "person.gender", label: "Gender", type: "select", options: [{ value: "Male", label: "Male" }, { value: "Female", label: "Female" }] },
  { key: "person.maritalStatus", label: "Marital Status", type: "select", options: [{ value: "Single", label: "Single" }, { value: "Married", label: "Married" }, { value: "Divorced", label: "Divorced" }, { value: "Widowed", label: "Widowed" }] }
];

const GROUP_FIELDS: TriggerFieldDef[] = [
  { key: "group.id", label: "Group", type: "select", optionsSource: "groups" },
  { key: "group.name", label: "Group Name", type: "string" }
];

// The triggerable events. Each lists the fields a condition may reference; the
// resolve() switch below must produce a matching fact for each key.
export const EVENT_DEFS: TriggerEventDef[] = [
  { eventType: "person.created", label: "Person · Created", recordType: "person", fields: PERSON_FIELDS },
  { eventType: "person.updated", label: "Person · Updated", recordType: "person", fields: PERSON_FIELDS },
  {
    eventType: "donation.created",
    label: "Donation · Created",
    recordType: "donation",
    fields: [
      { key: "donation.amount", label: "Amount", type: "number" },
      { key: "donation.method", label: "Method", type: "string" },
      { key: "donation.isFirstTime", label: "First-Time Donor", type: "select", options: [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] },
      { key: "person.membershipStatus", label: "Donor Membership Status", type: "select", options: MEMBERSHIP_STATUS_OPTIONS },
      { key: "fundDonation.fundId", label: "Fund", type: "select", optionsSource: "funds" }
    ]
  },
  { eventType: "group.member.added", label: "Group · Member Joined", recordType: "group", fields: GROUP_FIELDS },
  { eventType: "group.member.removed", label: "Group · Member Left", recordType: "group", fields: GROUP_FIELDS },
  { eventType: "group.member.requested", label: "Group · Join Requested", recordType: "group", fields: GROUP_FIELDS },
  {
    eventType: "group.created",
    label: "Group · Created",
    recordType: "group",
    fields: [
      { key: "group.name", label: "Group Name", type: "string" },
      { key: "group.categoryName", label: "Category", type: "string" }
    ]
  },
  {
    eventType: "form.submission.created",
    label: "Form · Submitted",
    recordType: "form",
    fields: [
      { key: "formSubmission.formId", label: "Form", type: "select", optionsSource: "forms" },
      { key: "person.membershipStatus", label: "Submitter Membership Status", type: "select", options: MEMBERSHIP_STATUS_OPTIONS }
    ]
  },
  {
    eventType: "attendance.recorded",
    label: "Check-In · Recorded",
    recordType: "attendance",
    fields: [
      { key: "group.id", label: "Group", type: "select", optionsSource: "groups" },
      { key: "person.membershipStatus", label: "Membership Status", type: "select", options: MEMBERSHIP_STATUS_OPTIONS }
    ]
  },
  {
    eventType: "registration.created",
    label: "Event · Registration Created",
    recordType: "registration",
    fields: [
      { key: "registration.eventId", label: "Event", type: "select", optionsSource: "events" },
      { key: "person.membershipStatus", label: "Registrant Membership Status", type: "select", options: MEMBERSHIP_STATUS_OPTIONS }
    ]
  },
  {
    eventType: "list.member.added",
    label: "List · Member Added",
    recordType: "list",
    fields: [
      { key: "list.id", label: "List", type: "select", optionsSource: "lists" },
      { key: "list.name", label: "List Name", type: "string" }
    ]
  },
  {
    eventType: "list.member.removed",
    label: "List · Member Removed",
    recordType: "list",
    fields: [
      { key: "list.id", label: "List", type: "select", optionsSource: "lists" },
      { key: "list.name", label: "List Name", type: "string" }
    ]
  }
];

export class EventTriggerHelper {
  private static cache = new Map<string, { types: Set<string>; expires: number }>();
  private static TTL_MS = 60000;

  public static invalidate(churchId: string): void {
    EventTriggerHelper.cache.delete(churchId);
  }

  public static fieldDefs(): TriggerEventDef[] {
    return EVENT_DEFS;
  }

  // Subscribed to InternalEventBus. Wrapped in try/catch — the doing module may
  // not be booted in this process, and a trigger failure must never break the write.
  public static async onEvent(churchId: string, event: string, payload: any): Promise<void> {
    try {
      if (!churchId || !payload) return;
      const repos = await RepoManager.getRepos<Repos>("doing");
      const types = await EventTriggerHelper.eventTypesForChurch(churchId, repos);
      if (!types.has(event)) return; // cheap cached gate

      const triggers = (await repos.workflowTrigger.loadByEventType(churchId, event)) as WorkflowTrigger[];
      if (triggers.length === 0) return;

      // Most events resolve to one subject; some (e.g. multi-person form posts) to several.
      const resolved = await EventTriggerHelper.resolve(churchId, event, payload);
      for (const { subject, facts } of resolved) {
        for (const t of triggers) {
          if (!t.workflowId) continue;
          if (!FilterMatcher.matches(facts, FilterMatcher.parseConditions(t.conditions))) continue;
          if (FilterMatcher.toBool(t.oncePerSubject) && subject.id
            && (await repos.task.loadBySubjectInWorkflow(churchId, t.workflowId, subject.type, subject.id))) continue;
          if (subject.type === "person" && subject.id && !subject.label) {
            const people = await getMembershipModuleGateway().loadPeople(churchId, [subject.id]);
            subject.label = people[0]?.displayName;
          }
          // Records the execution and creates the card; failures land in history + retry.
          await ExecutionHelper.startAndAttempt(t, subject, event, repos);
        }
      }
    } catch {
      // doing not reachable / transient — never break the originating write
    }
  }

  // Per-record-type logic: load related records (cross-module via gateways), then
  // return the card subject(s) + a flat facts map. One case per event; [] = no subject.
  private static async resolve(churchId: string, event: string, payload: any): Promise<{ subject: Subject; facts: Record<string, any> }[]> {
    switch (event) {
      case "person.created":
      case "person.updated":
        return [
          {
            subject: { type: "person", id: payload.id, label: payload.displayName },
            facts: {
              "person.membershipStatus": payload.membershipStatus,
              "person.gender": payload.gender,
              "person.maritalStatus": payload.maritalStatus
            }
          }
        ];

      case "donation.created": {
        if (!payload.personId) return []; // anonymous donation has no subject
        const person = await getMembershipModuleGateway().loadPerson(churchId, payload.personId);
        const funds = await getGivingModuleGateway().loadFundDonations(churchId, payload.id);
        const donationCount = await getGivingModuleGateway().loadDonationCountForPerson(churchId, payload.personId);
        return [
          {
            subject: { type: "person", id: payload.personId },
            facts: {
              "donation.amount": payload.amount,
              "donation.method": payload.method,
              "donation.isFirstTime": donationCount <= 1 ? "true" : "false",
              "person.membershipStatus": person?.membershipStatus,
              "fundDonation.fundId": funds.map((f) => f.fundId)
            }
          }
        ];
      }

      case "group.member.added":
      case "group.member.removed":
      case "group.member.requested": {
        const group = await getMembershipModuleGateway().loadGroup(churchId, payload.groupId);
        return [
          {
            subject: { type: "person", id: payload.personId },
            facts: { "group.id": payload.groupId, "group.name": group?.name }
          }
        ];
      }

      case "group.created":
        return [
          {
            subject: { type: "group", id: payload.id, label: payload.name },
            facts: { "group.name": payload.name, "group.categoryName": payload.categoryName }
          }
        ];

      case "form.submission.created": {
        // payload is a submission (or, defensively, an array of them). The subject is
        // the person the submission is about (contentType "person").
        const subs = Array.isArray(payload) ? payload : [payload];
        const out: { subject: Subject; facts: Record<string, any> }[] = [];
        for (const sub of subs) {
          if (sub?.contentType !== "person" || !sub.contentId) continue;
          const person = await getMembershipModuleGateway().loadPerson(churchId, sub.contentId);
          out.push({
            subject: { type: "person", id: sub.contentId },
            facts: { "formSubmission.formId": sub.formId, "person.membershipStatus": person?.membershipStatus }
          });
        }
        return out;
      }

      case "attendance.recorded": {
        // payload is a Visit; the group can live on the visit itself (group check-in)
        // or on the sessions of its visitSessions (service check-in).
        if (!payload.personId) return [];
        const groupIds = new Set<string>();
        if (payload.groupId) groupIds.add(payload.groupId);
        const sessionIds = (payload.visitSessions || []).map((vs: any) => vs?.sessionId).filter(Boolean);
        if (sessionIds.length > 0) {
          const fromSessions = await getAttendanceModuleGateway().loadSessionGroupIds(churchId, sessionIds);
          fromSessions.forEach((id) => groupIds.add(id));
        }
        const person = await getMembershipModuleGateway().loadPerson(churchId, payload.personId);
        return [
          {
            subject: { type: "person", id: payload.personId },
            facts: { "group.id": Array.from(groupIds), "person.membershipStatus": person?.membershipStatus }
          }
        ];
      }

      case "registration.created": {
        if (!payload.personId) return [];
        const person = await getMembershipModuleGateway().loadPerson(churchId, payload.personId);
        return [
          {
            subject: { type: "person", id: payload.personId },
            facts: { "registration.eventId": payload.eventId, "person.membershipStatus": person?.membershipStatus }
          }
        ];
      }

      case "list.member.added":
      case "list.member.removed":
        if (!payload.personId) return [];
        return [
          {
            subject: { type: "person", id: payload.personId },
            facts: { "list.id": payload.listId, "list.name": payload.listName }
          }
        ];

      default:
        return [];
    }
  }

  private static async eventTypesForChurch(churchId: string, repos: Repos): Promise<Set<string>> {
    const entry = EventTriggerHelper.cache.get(churchId);
    if (entry && entry.expires > Date.now()) return entry.types;
    const types = new Set(await repos.workflowTrigger.loadEventTypesForChurch(churchId));
    EventTriggerHelper.cache.set(churchId, { types, expires: Date.now() + EventTriggerHelper.TTL_MS });
    return types;
  }
}
