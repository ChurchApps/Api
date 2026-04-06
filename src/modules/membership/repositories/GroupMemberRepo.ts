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
    return getDb().selectFrom("groupMembers as gm")
      .innerJoin("people as p", (join) => join.onRef("p.id", "=", "gm.personId").on((eb) => eb.or([eb("p.removed", "=", 0 as any), eb("p.removed", "is", null)])))
      .selectAll("gm")
      .select([
        "p.photoUpdated", "p.displayName", "p.email", "p.homePhone", "p.mobilePhone", "p.workPhone", "p.optedOut", "p.address1", "p.address2", "p.city", "p.state", "p.zip", "p.householdId", "p.householdRole"
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
