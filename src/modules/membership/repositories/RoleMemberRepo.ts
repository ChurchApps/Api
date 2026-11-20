import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { RoleMember } from "../models/index.js";

@injectable()
export class RoleMemberRepo {
  public async save(model: RoleMember) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: RoleMember): Promise<RoleMember> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("roleMembers").values({
      id: model.id,
      churchId: model.churchId,
      roleId: model.roleId,
      userId: model.userId,
      addedBy: model.addedBy,
      dateAdded: sql<Date>`NOW()`
    }).execute();
    return model;
  }

  private async update(model: RoleMember): Promise<RoleMember> {
    await getDb().updateTable("roleMembers").set({
      roleId: model.roleId,
      userId: model.userId,
      dateAdded: model.dateAdded,
      addedBy: model.addedBy
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("roleMembers").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadById(id: string, churchId: string): Promise<RoleMember> {
    return (await getDb().selectFrom("roleMembers").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadByRoleId(roleId: string, churchId: string): Promise<RoleMember[]> {
    return getDb().selectFrom("roleMembers as rm")
      .leftJoin("userChurches as uc", (join) => join.onRef("rm.userId", "=", "uc.userId").onRef("rm.churchId", "=", "uc.churchId"))
      .selectAll("rm")
      .leftJoin("people as p", (join) => join.onRef("p.id", "=", "uc.personId").onRef("p.churchId", "=", "rm.churchId"))
      .select("uc.personId")
      .where("rm.roleId", "=", roleId)
      .where("rm.churchId", "=", churchId)
      .orderBy("p.lastName")
      .orderBy("p.firstName")
      .orderBy("rm.dateAdded")
      .execute() as Promise<RoleMember[]>;
  }

  public async delete(id: string, churchId: string): Promise<void> {
    await getDb().deleteFrom("roleMembers").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async deleteForRole(churchId: string, roleId: string) {
    await getDb().deleteFrom("roleMembers").where("churchId", "=", churchId).where("roleId", "=", roleId).execute();
  }

  public async deleteUser(userId: string) {
    await getDb().deleteFrom("roleMembers").where("userId", "=", userId).execute();
  }

  public async deleteSelf(churchId: string, userId: string) {
    await getDb().deleteFrom("roleMembers").where("churchId", "=", churchId).where("userId", "=", userId).execute();
  }

  public async existsForUser(churchId: string, userId: string): Promise<boolean> {
    const row = await getDb().selectFrom("roleMembers").select("id").where("churchId", "=", churchId).where("userId", "=", userId).executeTakeFirst();
    return !!row;
  }

  /** Churches where this user is the only member of the Domain Admins role. */
  public async loadSoleDomainAdminChurchIds(userId: string, churchId?: string): Promise<string[]> {
    let query = getDb().selectFrom("roleMembers as rm")
      .innerJoin("roles as r", (join) => join.onRef("r.id", "=", "rm.roleId").onRef("r.churchId", "=", "rm.churchId"))
      .select("rm.churchId")
      .where("r.name", "=", "Domain Admins")
      .where("rm.userId", "is not", null);
    if (churchId) query = query.where("rm.churchId", "=", churchId);
    const rows = await query
      .groupBy("rm.churchId")
      .having(sql`COUNT(DISTINCT rm.userId)`, "=", 1)
      .having(sql`MAX(rm.userId = ${userId})`, "=", 1)
      .execute();
    return rows.map((r) => r.churchId);
  }

  public async isSoleDomainAdmin(churchId: string, userId: string): Promise<boolean> {
    return (await this.loadSoleDomainAdminChurchIds(userId, churchId)).length > 0;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("roleMembers").selectAll().where("churchId", "=", churchId).execute();
  }

  public saveAll(models: RoleMember[]) {
    const promises: Promise<RoleMember>[] = [];
    models.forEach((model) => { promises.push(this.save(model)); });
    return Promise.all(promises);
  }

  public insert(model: RoleMember): Promise<RoleMember> {
    return this.create(model);
  }

  public convertToModel(_churchId: string, data: RoleMember) { return data; }
  public convertAllToModel(_churchId: string, data: RoleMember[]) { return data || []; }
}
