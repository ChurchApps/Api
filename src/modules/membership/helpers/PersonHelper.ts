import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { Household, Person, UserChurch } from "../models/index.js";
import { AuthenticatedUser } from "../auth/index.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { PersonHelper as BasePersonHelper } from "@churchapps/apihelper";

export class PersonHelper extends BasePersonHelper {
  private static async repos(): Promise<Repos> {
    return await RepoManager.getRepos<Repos>("membership");
  }
  public static async getPerson(churchId: string, email: string, firstName: string, lastName: string, canEdit: boolean) {
    const repos = await this.repos();
    const data: Person[] = (await repos.person.searchEmail(churchId, email)) as Person[];
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
      data.push(await repos.person.load(newPerson.churchId, newPerson.id));
    }
    const result = (await this.repos()).person.convertAllToModelWithPermissions(churchId, data, canEdit);
    const person = result[0];
    if (person.removed) {
      person.removed = false;
      await (await this.repos()).person.restore(person.churchId, person.id);
    }
    return person;
  }

  public static async registerGuestHousehold(churchId: string, members: { firstName: string, lastName: string, email?: string, phone?: string }[]) {
    if (!members || members.length === 0) throw new Error("At least one member is required");
    const repos = await this.repos();

    const household: Household = { churchId, name: members[0].lastName };
    await repos.household.save(household);

    const people: Person[] = [];
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      const person: Person = {
        churchId,
        householdId: household.id,
        householdRole: i === 0 ? "Head" : "Other",
        name: { first: m.firstName, last: m.lastName },
        membershipStatus: "Guest",
        contactInfo: {}
      };
      if (m.email) person.contactInfo.email = m.email;
      if (m.phone) person.contactInfo.mobilePhone = m.phone;
      const saved = await repos.person.save(person);
      people.push(saved);
    }

    return { householdId: household.id, people: people.map(p => ({ id: p.id, name: { first: p.name?.first, last: p.name?.last } })) };
  }

  public static async claim(au: AuthenticatedUser, churchId: string) {
    if (au?.email) {
      let person: Person = null;
      if (au.personId) {
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

        // return existing;
      }
      return { person, userChurch: existing || userChurch };
    }
  }
}
