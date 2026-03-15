import { eq, and, isNull, sql as drizzleSql } from "drizzle-orm";
import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { UserChurch, Person } from "../models/index.js";
import { getDrizzleDb } from "../../../db/drizzle.js";
import { getSchema } from "../../../db/schema/resolver.js";

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
    const db = getDrizzleDb("membership") as any;
    const { people, churches, groupMembers, groups, userChurches } = getSchema("membership");

    // Find people with exact email match who are in at least one group,
    // in non-archived churches, excluding churches where a userChurch already exists.
    const matches = await db
      .select({ personId: people.id, churchId: people.churchId })
      .from(people)
      .innerJoin(churches, and(eq(churches.id, people.churchId), isNull(churches.archivedDate)))
      .innerJoin(groupMembers, and(eq(groupMembers.personId, people.id), eq(groupMembers.churchId, people.churchId)))
      .innerJoin(groups, and(eq(groups.id, groupMembers.groupId), eq(groups.removed, false)))
      .leftJoin(userChurches, and(eq(userChurches.userId, userId), eq(userChurches.churchId, people.churchId)))
      .where(and(
        drizzleSql`lower(${people.email}) = lower(${email})`,
        eq(people.removed, false),
        isNull(userChurches.id)
      ))
      .groupBy(people.churchId, people.id);

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
