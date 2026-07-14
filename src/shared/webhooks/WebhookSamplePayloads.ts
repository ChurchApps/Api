import { ALL_WEBHOOK_EVENTS } from "./WebhookEvents.js";

const SAMPLES: Record<string, (churchId: string) => any> = {
  "person.created": (churchId) => ({ id: "smpl_person", churchId, name: { display: "Sample Person", first: "Sample", last: "Person" }, contactInfo: { email: "sample@example.com" } }),
  "person.updated": (churchId) => ({ id: "smpl_person", churchId, name: { display: "Sample Person", first: "Sample", last: "Person" }, contactInfo: { email: "sample@example.com" } }),
  "person.destroyed": (churchId) => ({ id: "smpl_person", churchId }),

  "group.created": (churchId) => ({ id: "smpl_group", churchId, name: "Sample Group", categoryName: "Sample Category" }),
  "group.updated": (churchId) => ({ id: "smpl_group", churchId, name: "Sample Group", categoryName: "Sample Category" }),
  "group.destroyed": (churchId) => ({ id: "smpl_group", churchId }),

  "group.member.added": (churchId) => ({ id: "smpl_groupmember", churchId, groupId: "smpl_group", groupName: "Sample Group", personId: "smpl_person", personName: "Sample Person" }),
  "group.member.removed": (churchId) => ({ id: "smpl_groupmember", churchId, groupId: "smpl_group", groupName: "Sample Group", personId: "smpl_person", personName: "Sample Person" }),
  "group.member.requested": (churchId) => ({ id: "smpl_joinrequest", churchId, groupId: "smpl_group", groupName: "Sample Group", personId: "smpl_person", personName: "Sample Person" }),

  "household.created": (churchId) => ({ id: "smpl_household", churchId, name: "Sample Household" }),
  "household.updated": (churchId) => ({ id: "smpl_household", churchId, name: "Sample Household" }),
  "household.destroyed": (churchId) => ({ id: "smpl_household", churchId }),

  "donation.created": (churchId) => ({ id: "smpl_donation", churchId, personId: "smpl_person", personName: "Sample Person", batchId: "smpl_batch", donationDate: new Date().toISOString(), amount: 50, method: "card", status: "complete" }),
  "donation.updated": (churchId) => ({ id: "smpl_donation", churchId, personId: "smpl_person", personName: "Sample Person", batchId: "smpl_batch", donationDate: new Date().toISOString(), amount: 50, method: "card", status: "complete" }),

  "attendance.recorded": (churchId) => ({ id: "smpl_visit", churchId, personId: "smpl_person", personName: "Sample Person", visitDate: new Date().toISOString(), checkinTime: new Date().toISOString() }),
  "attendance.checkout": (churchId) => ({ id: "smpl_visit", churchId, personId: "smpl_person", personName: "Sample Person", visitDate: new Date().toISOString(), checkoutTime: new Date().toISOString(), checkedOutBy: "Sample Parent" }),

  "session.created": (churchId) => ({ id: "smpl_session", churchId, groupId: "smpl_group", groupName: "Sample Group", serviceTimeId: "smpl_servicetime", sessionDate: new Date().toISOString() }),

  "form.submission.created": (churchId) => ({ id: "smpl_formsubmission", churchId, formId: "smpl_form", formName: "Sample Form", contentType: "person", contentId: "smpl_person", personName: "Sample Person" }),
  "registration.created": (churchId) => ({ id: "smpl_registration", churchId, eventId: "smpl_event", members: [{ personId: "smpl_person", name: "Sample Person" }] }),
  "list.member.added": (churchId) => ({ churchId, listId: "smpl_list", listName: "Sample List", personId: "smpl_person", personName: "Sample Person" }),
  "list.member.removed": (churchId) => ({ churchId, listId: "smpl_list", listName: "Sample List", personId: "smpl_person", personName: "Sample Person" }),

  "event.created": (churchId) => ({ id: "smpl_event", churchId, groupId: "smpl_group", title: "Sample Event", start: new Date().toISOString(), end: new Date().toISOString() }),
  "event.updated": (churchId) => ({ id: "smpl_event", churchId, groupId: "smpl_group", title: "Sample Event", start: new Date().toISOString(), end: new Date().toISOString() }),
  "event.destroyed": (churchId) => ({ id: "smpl_event", churchId })
};

export const samplePayloadFor = (event: string, churchId: string): any => {
  return (SAMPLES[event] ?? ((cid: string) => ({ id: "smpl_sample", churchId: cid })))(churchId);
};

export const hasSamplePayload = (event: string): boolean => event in SAMPLES;

export const SAMPLE_PAYLOAD_EVENTS: string[] = ALL_WEBHOOK_EVENTS.filter((e) => e in SAMPLES);
