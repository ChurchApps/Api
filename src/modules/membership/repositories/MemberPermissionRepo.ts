import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { MemberPermission } from "../models/index.js";

@injectable()
export class MemberPermissionRepo {
  public async save(model: MemberPermission) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: MemberPermission): Promise<MemberPermission> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("memberPermissions").values({
      id: model.id,
      churchId: model.churchId,
      memberId: model.memberId,
      contentType: model.contentType,
      contentId: model.contentId,
      action: model.action,
      emailNotification: model.emailNotification
    }).execute();
    return model;
  }

  private async update(model: MemberPermission): Promise<MemberPermission> {
    await getDb().updateTable("memberPermissions").set({
      memberId: model.memberId,
      contentType: model.contentType,
      contentId: model.contentId,
      action: model.action,
      emailNotification: model.emailNotification
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("memberPermissions").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async deleteByMemberId(churchId: string, memberId: string, contentId: string) {
    await getDb().deleteFrom("memberPermissions")
      .where("memberId", "=", memberId)
      .where("contentId", "=", contentId)
      .where("churchId", "=", churchId)
      .execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("memberPermissions").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("memberPermissions").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadMyByForm(churchId: string, formId: string, personId: string) {
    return (await getDb().selectFrom("memberPermissions").selectAll()
      .where("churchId", "=", churchId)
      .where("contentType", "=", "form")
      .where("contentId", "=", formId)
      .where("memberId", "=", personId)
      .executeTakeFirst()) ?? null;
  }

  public async loadByEmailNotification(churchId: string, contentType: string, contentId: string, emailNotification: boolean) {
    return getDb().selectFrom("memberPermissions").selectAll()
      .where("churchId", "=", churchId)
      .where("contentType", "=", contentType)
      .where("contentId", "=", contentId)
      .where("emailNotification", "=", emailNotification as any)
      .execute();
  }

  public async loadFormsByPerson(churchId: string, personId: string) {
    const result = await sql`SELECT mp.*, p.displayName as personName FROM memberPermissions mp INNER JOIN people p ON p.id=mp.memberId AND (p.removed=0 OR p.removed IS NULL) WHERE mp.churchId=${churchId} AND mp.memberId=${personId} ORDER BY mp.action, mp.emailNotification DESC`.execute(getDb());
    return result.rows;
  }

  public async loadPeopleByForm(churchId: string, formId: string) {
    const result = await sql`SELECT mp.*, p.displayName as personName FROM memberPermissions mp INNER JOIN people p ON p.id=mp.memberId AND (p.removed=0 OR p.removed IS NULL) WHERE mp.churchId=${churchId} AND mp.contentId=${formId} ORDER BY mp.action, mp.emailNotification DESC`.execute(getDb());
    return result.rows;
  }

  public saveAll(models: MemberPermission[]) {
    const promises: Promise<MemberPermission>[] = [];
    models.forEach((model) => { promises.push(this.save(model)); });
    return Promise.all(promises);
  }

  public insert(model: MemberPermission): Promise<MemberPermission> {
    return this.create(model);
  }

  protected rowToModel(row: any): MemberPermission {
    return {
      id: row.id,
      churchId: row.churchId,
      memberId: row.memberId,
      contentType: row.contentType,
      contentId: row.contentId,
      action: row.action,
      personName: row.personName,
      emailNotification: row.emailNotification
    };
  }

  public convertToModel(_churchId: string, data: any) {
    if (!data) return null;
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    if (!Array.isArray(data)) return [];
    return data.map((d) => this.rowToModel(d));
  }
}
