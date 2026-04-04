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

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("groupMembers").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("groupMembers").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadForGroup(churchId: string, groupId: string) {
    const result = await sql`SELECT gm.*, p.photoUpdated, p.displayName, p.email, p.homePhone, p.mobilePhone, p.workPhone, p.optedOut, p.address1, p.address2, p.city, p.state, p.zip, p.householdId, p.householdRole FROM groupMembers gm INNER JOIN people p ON p.id=gm.personId AND (p.removed=0 OR p.removed IS NULL) WHERE gm.churchId=${churchId} AND gm.groupId=${groupId} ORDER BY gm.leader DESC, p.lastName, p.firstName`.execute(getDb());
    return result.rows;
  }

  public async loadLeadersForGroup(churchId: string, groupId: string) {
    const result = await sql`SELECT gm.*, p.photoUpdated, p.displayName FROM groupMembers gm INNER JOIN people p ON p.id=gm.personId AND (p.removed=0 OR p.removed IS NULL) WHERE gm.churchId=${churchId} AND gm.groupId=${groupId} AND gm.leader=1 ORDER BY p.lastName, p.firstName`.execute(getDb());
    return result.rows;
  }

  public async loadForGroups(churchId: string, groupIds: string[]) {
    if (!groupIds.length) return [];
    const result = await sql`SELECT gm.*, p.photoUpdated, p.displayName, p.email FROM groupMembers gm INNER JOIN people p ON p.id=gm.personId AND (p.removed=0 OR p.removed IS NULL) WHERE gm.churchId=${churchId} AND gm.groupId IN (${sql.join(groupIds)}) ORDER BY gm.leader DESC, p.lastName, p.firstName`.execute(getDb());
    return result.rows;
  }

  public async loadForPerson(churchId: string, personId: string) {
    const result = await sql`SELECT gm.*, g.name as groupName FROM groupMembers gm INNER JOIN \`groups\` g ON g.Id=gm.groupId WHERE gm.churchId=${churchId} AND gm.personId=${personId} AND g.removed=0 ORDER BY g.name`.execute(getDb());
    return result.rows;
  }

  public async loadForPeople(peopleIds: string[]) {
    if (!peopleIds.length) return [];
    const result = await sql`SELECT gm.*, g.name, g.tags FROM groupMembers gm INNER JOIN \`groups\` g ON g.Id=gm.groupId WHERE gm.personId IN (${sql.join(peopleIds)})`.execute(getDb());
    return result.rows;
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
