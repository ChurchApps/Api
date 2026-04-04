import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Form } from "../models/index.js";
import { DateHelper } from "../helpers/index.js";

@injectable()
export class FormRepo {
  public async save(model: Form) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(form: Form): Promise<Form> {
    form.id = UniqueIdHelper.shortId();
    const accessStartTime = form.accessStartTime ? DateHelper.toMysqlDate(form.accessStartTime) : null;
    const accessEndTime = form.accessEndTime ? DateHelper.toMysqlDate(form.accessEndTime) : null;
    await getDb().insertInto("forms").values({
      id: form.id,
      churchId: form.churchId,
      name: form.name,
      contentType: form.contentType,
      accessStartTime: accessStartTime as any,
      accessEndTime: accessEndTime as any,
      restricted: form.restricted,
      thankYouMessage: form.thankYouMessage,
      createdTime: sql`NOW()` as any,
      modifiedTime: sql`NOW()` as any,
      archived: false as any,
      removed: false as any
    }).execute();
    return form;
  }

  private async update(form: Form): Promise<Form> {
    const accessStartTime = form.accessStartTime ? DateHelper.toMysqlDate(form.accessStartTime) : null;
    const accessEndTime = form.accessEndTime ? DateHelper.toMysqlDate(form.accessEndTime) : null;
    await getDb().updateTable("forms").set({
      name: form.name,
      contentType: form.contentType,
      restricted: form.restricted,
      accessStartTime: accessStartTime as any,
      accessEndTime: accessEndTime as any,
      archived: form.archived,
      thankYouMessage: form.thankYouMessage,
      modifiedTime: sql`NOW()` as any
    }).where("id", "=", form.id).where("churchId", "=", form.churchId).execute();
    return form;
  }

  public async delete(churchId: string, id: string) {
    await getDb().updateTable("forms").set({ removed: true as any }).where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("forms").selectAll().where("id", "=", id).where("churchId", "=", churchId).where("removed", "=", false as any).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("forms").selectAll().where("churchId", "=", churchId).where("removed", "=", false as any).where("archived", "=", false as any).orderBy("name").execute();
  }

  public async loadAllArchived(churchId: string) {
    return getDb().selectFrom("forms").selectAll().where("churchId", "=", churchId).where("removed", "=", false as any).where("archived", "=", true as any).execute();
  }

  public async loadByIds(churchId: string, ids: string[]) {
    if (ids.length === 0) return [];
    return getDb().selectFrom("forms").selectAll()
      .where("churchId", "=", churchId)
      .where("removed", "=", false as any)
      .where("archived", "=", false as any)
      .where("id", "in", ids)
      .orderBy("name")
      .execute();
  }

  public async loadNonMemberForms(churchId: string) {
    return getDb().selectFrom("forms").selectAll()
      .where("contentType", "<>", "form")
      .where("churchId", "=", churchId)
      .where("removed", "=", false as any)
      .where("archived", "=", false as any)
      .execute();
  }

  public async loadNonMemberArchivedForms(churchId: string) {
    return getDb().selectFrom("forms").selectAll()
      .where("contentType", "<>", "form")
      .where("churchId", "=", churchId)
      .where("removed", "=", false as any)
      .where("archived", "=", true as any)
      .execute();
  }

  public async loadMemberForms(churchId: string, personId: string) {
    const result = await sql`SELECT f.*, mp.action FROM forms f LEFT JOIN memberPermissions mp ON mp.contentId = f.id WHERE mp.memberId=${personId} AND f.churchId=${churchId} AND f.removed=0 AND f.archived=0`.execute(getDb());
    return result.rows;
  }

  public async loadMemberArchivedForms(churchId: string, personId: string) {
    const result = await sql`SELECT f.* FROM forms f LEFT JOIN memberPermissions mp ON mp.contentId = f.id WHERE mp.memberId=${personId} AND f.churchId=${churchId} AND f.removed=0 AND f.archived=1`.execute(getDb());
    return result.rows;
  }

  public async loadWithMemberPermissions(churchId: string, formId: string, personId: string) {
    const result = await sql`SELECT f.*, mp.action FROM forms f LEFT JOIN memberPermissions mp ON mp.contentId = f.id WHERE f.id=${formId} AND f.churchId=${churchId} AND mp.memberId=${personId} AND f.removed=0 AND archived=0`.execute(getDb());
    return (result.rows as any[])?.[0] || null;
  }

  public async access(id: string) {
    const result = await sql`SELECT id, name, restricted, churchId FROM forms WHERE id=${id} AND removed=0 AND archived=0`.execute(getDb());
    return (result.rows as any[])?.[0] || null;
  }

  public saveAll(models: Form[]) {
    const promises: Promise<Form>[] = [];
    models.forEach((model) => { promises.push(this.save(model)); });
    return Promise.all(promises);
  }

  public insert(model: Form): Promise<Form> {
    return this.create(model);
  }

  protected rowToModel(row: any): Form {
    return {
      id: row.id,
      churchId: row.churchId,
      name: row.name,
      contentType: row.contentType,
      createdTime: row.createdTime,
      modifiedTime: row.modifiedTime,
      accessStartTime: row.accessStartTime,
      accessEndTime: row.accessEndTime,
      restricted: row.restricted,
      archived: row.archived,
      action: row.action,
      thankYouMessage: row.thankYouMessage
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
