import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { Household, Person, UserChurch } from "../models/index.js";
import { AuthenticatedUser } from "../auth/index.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { PersonHelper as BasePersonHelper } from "@churchapps/apihelper";
import { SsoHelper } from "./SsoHelper.js";
import type { GuestMember, GuestRegistration } from "./GuestRegistrationHelper.js";
import { WebhookDispatcher } from "../../../shared/webhooks/WebhookDispatcher.js";
import { getAttendanceModuleGateway, getMessagingModuleGateway } from "../../../shared/modules/index.js";

export class PersonHelper extends BasePersonHelper {
  private static async repos(): Promise<Repos> {
    return await RepoManager.getRepos<Repos>("membership");
  }
  public static async getPerson(churchId: string, email: string, firstName: string, lastName: string, canEdit: boolean, allowRestore = true) {
    const repos = await this.repos();
    // searchEmail hides removed people, so a caller without allowRestore never even loads a deleted
    // person - it creates a fresh one instead. Only the restoring path looks at removed rows.
    const normalized = (email || "").trim().toLowerCase();
    const data: Person[] = ((allowRestore
      ? await repos.person.searchEmailIncludingRemoved(churchId, email)
      : await repos.person.searchEmail(churchId, email)) as any[]).filter((p) => normalized && (p.email || "").trim().toLowerCase() === normalized);
    if (data.length === 0) {
      const household: Household = { churchId, name: lastName };
      await repos.household.save(household);
      let newPerson: Person = {
        churchId,
        householdId: household.id,
        householdRole: "Head",
        name: { first: firstName, last: lastName },
        membershipStatus: "Guest",
        contactInfo: { email }
      };
      newPerson = await repos.person.save(newPerson);
      await WebhookDispatcher.emit(churchId, "person.created", newPerson);
      data.push(await repos.person.load(newPerson.churchId, newPerson.id));
    }
    const result = repos.person.convertAllToModelWithPermissions(churchId, data, canEdit);
    const person = result[0];
    if (allowRestore && person.removed) {
      person.removed = false;
      await repos.person.restore(person.churchId, person.id);
    }
    return person;
  }

  public static async registerGuestHousehold(churchId: string, registration: GuestRegistration, groupId?: string, recordAttendance?: boolean) {
    const members = registration?.members;
    if (!members || members.length === 0) throw new Error("At least one member is required");
    const repos = await this.repos();

    // Someone signing up again reuses their profile: the same first name plus the same email or phone.
    // Reused people are never edited, so an anonymous form cannot overwrite stored details.
    const matches: Person[] = [];
    for (const m of members) {
      const row = (m.email || m.phone) ? await repos.person.findGuestMatch(churchId, { firstName: m.firstName, email: m.email, phone: m.phone }) : null;
      matches.push(row ? repos.person.convertToModel(churchId, row) : null);
    }
    const matchedHouseholdId = matches.find((p) => p)?.householdId;
    let householdId = matchedHouseholdId;
    let householdPeople: Person[] = null;

    const people: Person[] = [];
    const submitted: GuestMember[] = [];
    const reusedIds = new Set<string>();
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      let existing = matches[i];
      // A child without contact details is matched by first name inside the household found above.
      if (!existing && !m.email && !m.phone && matchedHouseholdId) {
        if (!householdPeople) householdPeople = repos.person.convertAllToModel(churchId, await repos.person.loadByHousehold(churchId, matchedHouseholdId));
        const first = (m.firstName || "").trim().toLowerCase();
        const sameName = householdPeople.filter((p) => (p.name?.first || "").trim().toLowerCase() === first);
        if (sameName.length === 1) existing = sameName[0];
      }
      if (existing) {
        if (!reusedIds.has(existing.id)) { reusedIds.add(existing.id); people.push(existing); submitted.push(m); }
        continue;
      }

      const joiningExisting = !!householdId;
      if (!householdId) {
        const household: Household = { churchId, name: m.lastName };
        await repos.household.save(household);
        householdId = household.id;
      }
      const person: Person = {
        churchId,
        householdId,
        householdRole: i === 0 && !joiningExisting ? "Head" : "Other",
        name: { first: m.firstName, last: m.lastName },
        membershipStatus: "Visitor",
        contactInfo: { ...(registration.address || {}) }
      };
      if (m.email) person.contactInfo.email = m.email;
      if (m.phone) person.contactInfo.mobilePhone = m.phone;
      // birthDate is a validated YYYY-MM-DD string; PersonRepo stores it as a date-only value.
      if (m.birthDate) person.birthDate = m.birthDate as any;
      if (m.gender) person.gender = m.gender;
      if (m.grade) person.grade = m.grade;
      if (i === 0 && registration.maritalStatus) person.maritalStatus = registration.maritalStatus;
      const saved = await repos.person.save(person);
      await WebhookDispatcher.emit(churchId, "person.created", saved);
      people.push(saved);
      submitted.push(m);
    }

    // The sign-up itself has succeeded by now, so a failed group add or note is logged, not returned.
    if (groupId) {
      try {
        const group = await repos.group.load(churchId, groupId);
        if (group) {
          const memberIds = new Set((await repos.groupMember.loadForGroup(churchId, groupId)).map((gm: any) => gm.personId));
          for (const p of people) {
            if (memberIds.has(p.id)) continue;
            const gm = await repos.groupMember.save({ churchId, groupId, personId: p.id, joinDate: new Date() });
            await repos.groupMemberHistory.log(churchId, groupId, p.id, "joined");
            await WebhookDispatcher.emit(churchId, "group.member.added", gm);
          }
        }
      } catch (err) {
        console.error("[PersonHelper] guest group add failed:", err);
      }
      // Only the group's scheduled service times that are under way right now count; otherwise nothing is recorded.
      if (recordAttendance) {
        const at = new Date();
        for (const p of people) {
          try {
            await getAttendanceModuleGateway().recordAttendance(churchId, p.id, groupId, at);
          } catch (err) {
            console.error("[PersonHelper] guest attendance failed:", err);
          }
        }
      }
    }
    if (registration.comments) {
      const head = people[0];
      try {
        // The Notes tab reads the person's own conversation, so the new one is linked back.
        const conversationId = await getMessagingModuleGateway().createPersonNote(churchId, head.id, `${head.name?.first} ${head.name?.last} Notes`, registration.comments);
        if (!reusedIds.has(head.id)) {
          head.conversationId = conversationId;
          await repos.person.save(head);
        } else if (!head.conversationId) {
          // Only link the reused person's Notes tab when it has none, and touch nothing else on their record.
          await repos.person.updateFieldsByIds(churchId, [head.id], { conversationId });
        }
      } catch (err) {
        console.error("[PersonHelper] guest comment note failed:", err);
      }
    }

    // Echo the submitted names, never the stored ones, so the public form reveals nothing about a matched person.
    return { householdId, people: people.map((p, i) => ({ id: p.id, name: { first: submitted[i].firstName, last: submitted[i].lastName } })) };
  }

  public static async claim(au: AuthenticatedUser, churchId: string) {
    if (au?.email) {
      let person: Person = null;
      if (au.personId && au.churchId === churchId) {
        const repos = await this.repos();
        const d = await repos.person.load(au.churchId, au.personId);
        if (d === null) person = await this.getPerson(churchId, au.email, au.firstName, au.lastName, au.checkAccess(Permissions.people.edit));
        else person = repos.person.convertToModelWithPermissions(au.churchId, d, au.checkAccess(Permissions.people.edit));
      } else {
        person = await this.getPerson(churchId, au.email, au.firstName, au.lastName, au.checkAccess(Permissions.people.edit));
      }

      const userChurch: UserChurch = {
        userId: au.id,
        churchId,
        personId: person.id
      };

      const repos = await this.repos();
      let existing: UserChurch = await repos.userChurch.loadByUserId(au.id, churchId);
      if (!existing) {
        existing = await repos.userChurch.save(userChurch);
      } else {
        if (existing.personId !== person.id) {
          existing.personId = person.id;
          await repos.userChurch.save(existing);
        }
      }
      // Apply any SSO photo stashed before this person existed (never overwrites an existing photo).
      await SsoHelper.applyStashedPhoto(au.id, churchId, person, repos);
      return { person, userChurch: existing || userChurch };
    }
  }
}
