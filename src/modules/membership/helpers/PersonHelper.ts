import { Repositories } from "../repositories";
import { RepositoryManager } from "../../../shared/infrastructure";
import { Household, Person, UserChurch } from "../models";
import { AuthenticatedUser } from "../auth";
import { Permissions } from "../../../shared/helpers";
import { PersonHelper as BasePersonHelper } from "@churchapps/apihelper";

export class PersonHelper extends BasePersonHelper {
  private static async repos(): Promise<Repositories> {
    return await RepositoryManager.getRepositories<Repositories>("membership");
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
        // return Repositories.getCurrent().userChurch.convertToModel(result);
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
