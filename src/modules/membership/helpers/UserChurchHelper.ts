import { Repos } from "../repositories/index.js";
import { RepoManager, TypedDB } from "../../../shared/infrastructure/index.js";
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

    // Single query: find people with exact email match who are in at least one group,
    // in non-archived churches, excluding churches where a userChurch already exists.
    const sql =
      "SELECT p.id as personId, p.churchId" +
      " FROM people p" +
      " INNER JOIN churches c ON c.id = p.churchId AND c.archivedDate IS NULL" +
      " INNER JOIN groupMembers gm ON gm.personId = p.id AND gm.churchId = p.churchId" +
      " INNER JOIN `groups` g ON g.id = gm.groupId AND g.removed = 0" +
      " LEFT JOIN userChurches uc ON uc.userId = ? AND uc.churchId = p.churchId" +
      " WHERE LOWER(p.email) = LOWER(?) AND p.removed = 0 AND uc.id IS NULL" +
      " GROUP BY p.churchId, p.id";
    const matches: Array<{ personId: string; churchId: string }> = await TypedDB.query(sql, [userId, email]);

    // Pick one person per church (first match) and save userChurch records
    const seenChurches = new Set<string>();
    const savePromises: Promise<any>[] = [];
    for (const match of matches) {
      if (seenChurches.has(match.churchId)) continue;
      seenChurches.add(match.churchId);
      savePromises.push(repos.userChurch.save({ userId, churchId: match.churchId, personId: match.personId }));
    }
    if (savePromises.length > 0) await Promise.all(savePromises);
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
