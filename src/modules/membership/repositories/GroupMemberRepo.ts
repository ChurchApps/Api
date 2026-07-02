import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { GroupMember } from "../models/index.js";
import { PersonHelper } from "../helpers/index.js";

@injectable()
export class GroupMemberRepo {
  public async save(model: GroupMember) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: GroupMember): Promise<GroupMember> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("groupMembers").values({
      id: model.id,
      churchId: model.churchId,
      groupId: model.groupId,
      personId: model.personId,
      leader: model.leader,
      joinDate: sql`NOW()` as any
    }).execute();
    return model;
  }

  private async update(model: GroupMember): Promise<GroupMember> {
    await getDb().updateTable("groupMembers").set({
      groupId: model.groupId,
      personId: model.personId,
      leader: model.leader
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("groupMembers").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async deleteForGroupAndPeople(churchId: string, groupId: string, personIds: string[]) {
    if (!personIds.length) return;
    await getDb().deleteFrom("groupMembers").where("churchId", "=", churchId).where("groupId", "=", groupId).where("personId", "in", personIds).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("groupMembers").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("groupMembers").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadForGroup(churchId: string, groupId: string) {
    return getDb().selectFrom("groupMembers as gm")
      .innerJoin("people as p", (join) => join.onRef("p.id", "=", "gm.personId").on((eb) => eb.or([eb("p.removed", "=", 0 as any), eb("p.removed", "is", null)])))
      .selectAll("gm")
      .select([
        "p.photoUpdated", "p.displayName", "p.email", "p.homePhone", "p.mobilePhone", "p.workPhone", "p.optedOut", "p.address1", "p.address2", "p.city", "p.state", "p.zip", "p.householdId", "p.householdRole", "p.birthDate"
      ])
      .where("gm.churchId", "=", churchId)
      .where("gm.groupId", "=", groupId)
      .orderBy("gm.leader", "desc")
      .orderBy("p.lastName")
      .orderBy("p.firstName")
      .execute();
  }

  public async loadLeadersForGroup(churchId: string, groupId: string) {
    return getDb().selectFrom("groupMembers as gm")
      .innerJoin("people as p", (join) => join.onRef("p.id", "=", "gm.personId").on((eb) => eb.or([eb("p.removed", "=", 0 as any), eb("p.removed", "is", null)])))
      .selectAll("gm")
      .select(["p.photoUpdated", "p.displayName"])
      .where("gm.churchId", "=", churchId)
      .where("gm.groupId", "=", groupId)
      .where("gm.leader", "=", 1 as any)
      .orderBy("p.lastName")
      .orderBy("p.firstName")
      .execute();
  }

  // Privacy-safe roster for public website elements (staff/team grid).
  // Roster exposure is an explicit per-group opt-in (publicRoster=1) on top of
  // the group being publicly visible (non-archived, non-removed); a group that
  // hasn't opted in, is hidden, or is missing yields no rows. Only display name
  // + photo + leader flag are selected — never contact/demographic fields.
  public async loadPublicForGroup(churchId: string, groupId: string) {
    return getDb().selectFrom("groupMembers as gm")
      .innerJoin("people as p", (join) => join.onRef("p.id", "=", "gm.personId").on((eb) => eb.or([eb("p.removed", "=", 0 as any), eb("p.removed", "is", null)])))
      .innerJoin("groups as g", "g.id", "gm.groupId")
      .select(["gm.id", "gm.personId", "gm.leader", "p.displayName", "p.photoUpdated"])
      .where("gm.churchId", "=", churchId)
      .where("gm.groupId", "=", groupId)
      .where("g.removed", "=", false as any)
      .where("g.publicRoster", "=", true as any)
      .where((eb) => eb.or([eb("g.archived", "is", null), eb("g.archived", "=", false as any)]))
      .orderBy("gm.leader", "desc")
      .orderBy("p.lastName")
      .orderBy("p.firstName")
      .execute();
  }

  public async loadForGroups(churchId: string, groupIds: string[]) {
    if (!groupIds.length) return [];
    return getDb().selectFrom("groupMembers as gm")
      .innerJoin("people as p", (join) => join.onRef("p.id", "=", "gm.personId").on((eb) => eb.or([eb("p.removed", "=", 0 as any), eb("p.removed", "is", null)])))
      .selectAll("gm")
      .select(["p.photoUpdated", "p.displayName", "p.email"])
      .where("gm.churchId", "=", churchId)
      .where("gm.groupId", "in", groupIds)
      .orderBy("gm.leader", "desc")
      .orderBy("p.lastName")
      .orderBy("p.firstName")
      .execute();
  }

  public async loadForPerson(churchId: string, personId: string) {
    return getDb().selectFrom("groupMembers as gm")
      .innerJoin("groups as g", "g.id", "gm.groupId")
      .selectAll("gm")
      .select("g.name as groupName")
      .where("gm.churchId", "=", churchId)
      .where("gm.personId", "=", personId)
      .where("g.removed", "=", 0 as any)
      .orderBy("g.name")
      .execute();
  }

  public async loadForPeople(peopleIds: string[]) {
    if (!peopleIds.length) return [];
    return getDb().selectFrom("groupMembers as gm")
      .innerJoin("groups as g", "g.id", "gm.groupId")
      .selectAll("gm")
      .select(["g.name", "g.tags"])
      .where("gm.personId", "in", peopleIds)
      .execute();
  }

  // Per-group member aggregates for the health comparison view.
  public async loadHealthSummary(churchId: string) {
    const rows = await sql<any>`SELECT gm.groupId,
        COUNT(*) AS memberCount,
        SUM(CASE WHEN gm.leader = 1 THEN 1 ELSE 0 END) AS leaderCount,
        AVG(TIMESTAMPDIFF(YEAR, p.birthDate, CURDATE())) AS averageAge,
        SUM(CASE WHEN LOWER(TRIM(p.gender)) = 'female' THEN 1 ELSE 0 END) AS femaleCount,
        SUM(CASE WHEN LOWER(TRIM(p.gender)) = 'male' THEN 1 ELSE 0 END) AS maleCount
      FROM groupMembers gm
      INNER JOIN people p ON p.id = gm.personId AND IFNULL(p.removed, 0) = 0
      WHERE gm.churchId = ${churchId}
      GROUP BY gm.groupId`.execute(getDb());
    return rows.rows;
  }

  // Same buckets as PersonRepo.loadDemographics, scoped to one group's members.
  public async loadDemographicsForGroup(churchId: string, groupId: string) {
    const db = getDb();
    const genderRows = await sql<any>`SELECT COALESCE(NULLIF(TRIM(p.gender), ''), 'Unassigned') AS name, COUNT(*) AS count
      FROM groupMembers gm
      INNER JOIN people p ON p.id = gm.personId AND IFNULL(p.removed, 0) = 0
      WHERE gm.churchId = ${churchId} AND gm.groupId = ${groupId}
      GROUP BY name ORDER BY count DESC`.execute(db);

    const ageRows = await sql<any>`SELECT
        CASE
          WHEN age BETWEEN 0 AND 3 THEN '0-3'
          WHEN age BETWEEN 4 AND 11 THEN '4-11'
          WHEN age BETWEEN 12 AND 18 THEN '12-18'
          WHEN age BETWEEN 19 AND 25 THEN '19-25'
          WHEN age BETWEEN 26 AND 35 THEN '26-35'
          WHEN age BETWEEN 36 AND 50 THEN '36-50'
          WHEN age BETWEEN 51 AND 64 THEN '51-64'
          ELSE '65+'
        END AS ageGroup,
        COALESCE(NULLIF(TRIM(gender), ''), 'Unassigned') AS gender,
        COUNT(*) AS count
      FROM (
        SELECT TIMESTAMPDIFF(YEAR, p.birthDate, CURDATE()) AS age, p.gender
        FROM groupMembers gm
        INNER JOIN people p ON p.id = gm.personId AND IFNULL(p.removed, 0) = 0
        WHERE gm.churchId = ${churchId} AND gm.groupId = ${groupId} AND p.birthDate IS NOT NULL
      ) sub
      GROUP BY ageGroup, gender`.execute(db);

    const order = [
      "0-3", "4-11", "12-18", "19-25", "26-35", "36-50", "51-64", "65+"
    ];
    const ageMap: { [group: string]: { group: string; female: number; male: number; unassigned: number } } = {};
    order.forEach((g) => (ageMap[g] = { group: g, female: 0, male: 0, unassigned: 0 }));
    (ageRows.rows as any[]).forEach((r) => {
      const bucket = ageMap[r.ageGroup];
      if (!bucket) return;
      const g = String(r.gender).toLowerCase();
      const key = g === "female" ? "female" : g === "male" ? "male" : "unassigned";
      bucket[key] += Number(r.count);
    });

    return {
      gender: (genderRows.rows as any[]).map((r) => ({ name: r.name as string, count: Number(r.count) })),
      ageGroups: order.map((g) => ageMap[g])
    };
  }

  public saveAll(models: GroupMember[]) {
    const promises: Promise<GroupMember>[] = [];
    models.forEach((model) => { promises.push(this.save(model)); });
    return Promise.all(promises);
  }

  public insert(model: GroupMember): Promise<GroupMember> {
    return this.create(model);
  }

  protected rowToModel(row: any): GroupMember {
    const result: GroupMember = {
      id: row.id,
      churchId: row.churchId,
      groupId: row.groupId,
      personId: row.personId,
      joinDate: row.joinDate,
      leader: row.leader
    };
    if (row.displayName !== undefined) {
      result.person = {
        id: result.personId,
        photoUpdated: row.photoUpdated,
        name: { display: row.displayName },
        contactInfo: {
          email: row.email,
          homePhone: row.homePhone,
          mobilePhone: row.mobilePhone,
          workPhone: row.workPhone,
          address1: row.address1,
          address2: row.address2,
          city: row.city,
          state: row.state,
          zip: row.zip
        },
        householdId: row.householdId,
        householdRole: row.householdRole,
        optedOut: row.optedOut
      };
      result.person.photo = PersonHelper.getPhotoPath(row.churchId, result.person);
    }
    if (row.groupName !== undefined) result.group = { id: result.groupId, name: row.groupName };

    return result;
  }

  public convertToModel(_churchId: string, data: any) {
    if (!data) return null;
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    if (!Array.isArray(data)) return [];
    return data.map((d) => this.rowToModel(d));
  }

  // Flattened, privacy-safe projection for the public staff/team grid.
  public convertAllToPublicModel(churchId: string, data: any[]) {
    if (!Array.isArray(data)) return [];
    return data.map((d) => {
      const result: any = {
        id: d.personId,
        name: { display: d.displayName },
        photo: PersonHelper.getPhotoPath(churchId, { id: d.personId, photoUpdated: d.photoUpdated })
      };
      if (d.leader) result.role = "Leader";
      return result;
    });
  }

  public convertAllToBasicModel(churchId: string, data: any[]) {
    const result: GroupMember[] = [];
    data.forEach((d) => result.push(this.convertToBasicModel(churchId, d)));
    return result;
  }

  public convertToBasicModel(_churchId: string, data: any) {
    const result = { id: data.id, groupId: data.groupId, personId: data.personId, displayName: data.displayName };
    return result;
  }
}
