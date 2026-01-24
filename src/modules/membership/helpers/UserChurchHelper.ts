import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { UserChurch, Person } from "../models/index.js";

export class UserChurchHelper {

  private static async repos(): Promise<Repos> {
    return await RepoManager.getRepos<Repos>("membership");
  }

  // Scenario 1: When a person is added to a group, create userChurch if matching user exists
  public static async createForGroupMember(churchId: string, personId: string): Promise<void> {
    const repos = await this.repos();
    const person: Person = await repos.person.load(churchId, personId);
    if (!person?.email) return;

    const user = await repos.user.loadByEmail(person.email);
    if (!user) return;

    const existing = await repos.userChurch.loadByUserId(user.id, churchId);
    if (existing) return;

    const userChurch: UserChurch = { userId: user.id, churchId, personId };
    await repos.userChurch.save(userChurch);
  }

  // Scenario 2: When user is created, find all matching people in groups across churches
  public static async createForNewUser(userId: string, email: string): Promise<void> {
    if (!email) return;
    const repos = await this.repos();

    const churches = await repos.church.loadAll();

    for (const church of churches) {
      const existing = await repos.userChurch.loadByUserId(userId, church.id);
      if (existing) continue;

      const matchingPeople = await repos.person.searchEmail(church.id, email);
      const exactMatches = matchingPeople.filter((p: Person) => p.email?.toLowerCase() === email.toLowerCase());

      for (const person of exactMatches) {
        const groups = await repos.groupMember.loadForPerson(church.id, person.id);
        if (groups && groups.length > 0) {
          const userChurch: UserChurch = { userId, churchId: church.id, personId: person.id };
          await repos.userChurch.save(userChurch);
          break;
        }
      }
    }
  }

  // Scenario 3: When person email is updated, create userChurch if matching user exists and person is in groups
  public static async createForPersonEmailUpdate(churchId: string, personId: string, email: string): Promise<void> {
    if (!email) return;
    const repos = await this.repos();

    const groups = await repos.groupMember.loadForPerson(churchId, personId);
    if (!groups || groups.length === 0) return;

    const user = await repos.user.loadByEmail(email);
    if (!user) return;

    const existing = await repos.userChurch.loadByUserId(user.id, churchId);
    if (existing) return;

    const userChurch: UserChurch = { userId: user.id, churchId, personId };
    await repos.userChurch.save(userChurch);
  }
}
