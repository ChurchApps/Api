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
      dateAdded: sql`NOW()` as any
    }).execute();
    return model;
  }

  private async update(model: RoleMember): Promise<RoleMember> {
    await getDb().updateTable("roleMembers").set({
      roleId: model.roleId,
      userId: model.userId,
      dateAdded: model.dateAdded as any,
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
    const result = await sql`SELECT rm.*, uc.personId FROM roleMembers rm LEFT JOIN userChurches uc ON rm.userId=uc.userId AND rm.churchId=uc.churchId WHERE roleId=${roleId} AND rm.churchId=${churchId} ORDER BY rm.dateAdded`.execute(getDb());
    return result.rows as RoleMember[];
  }

  public async delete(id: string, churchId: string): Promise<any> {
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

  public convertToModel(_churchId: string, data: any) { return data; }
  public convertAllToModel(_churchId: string, data: any[]) { return data || []; }
}
