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
      description: form.description,
      contentType: form.contentType,
      accessStartTime: sql<Date>`${accessStartTime}`,
      accessEndTime: sql<Date>`${accessEndTime}`,
      restricted: form.restricted,
      thankYouMessage: form.thankYouMessage,
      photoUrl: form.photoUrl || null,
      displayMode: form.displayMode ?? "standard",
      autoCreatePerson: form.autoCreatePerson ?? false,
      groupId: form.groupId || null,
      followUpSubject: form.followUpSubject,
      followUpBody: form.followUpBody,
      createdTime: sql<Date>`NOW()`,
      modifiedTime: sql<Date>`NOW()`,
      archived: false,
      removed: false
    }).execute();
    return form;
  }

  private async update(form: Form): Promise<Form> {
    const accessStartTime = form.accessStartTime ? DateHelper.toMysqlDate(form.accessStartTime) : null;
    const accessEndTime = form.accessEndTime ? DateHelper.toMysqlDate(form.accessEndTime) : null;
    await getDb().updateTable("forms").set({
      name: form.name,
      description: form.description,
      contentType: form.contentType,
      restricted: form.restricted,
      accessStartTime: sql<Date>`${accessStartTime}`,
      accessEndTime: sql<Date>`${accessEndTime}`,
      archived: form.archived,
      thankYouMessage: form.thankYouMessage,
      photoUrl: form.photoUrl || null,
      displayMode: form.displayMode ?? "standard",
      autoCreatePerson: form.autoCreatePerson ?? false,
      groupId: form.groupId || null,
      followUpSubject: form.followUpSubject,
      followUpBody: form.followUpBody,
      modifiedTime: sql<Date>`NOW()`
    }).where("id", "=", form.id).where("churchId", "=", form.churchId).execute();
    return form;
  }

  public async delete(churchId: string, id: string) {
    await getDb().updateTable("forms").set({ removed: true }).where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("forms").selectAll().where("id", "=", id).where("churchId", "=", churchId).where("removed", "=", false).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("forms").selectAll().where("churchId", "=", churchId).where("removed", "=", false).where("archived", "=", false).orderBy("name").execute();
  }

  public async loadAllArchived(churchId: string) {
    return getDb().selectFrom("forms").selectAll().where("churchId", "=", churchId).where("removed", "=", false).where("archived", "=", true).execute();
  }

  // Archived forms are included on purpose: this hydrates a person's existing
  // submission history, and archiving a form only stops new submissions.
  public async loadByIds(churchId: string, ids: string[]) {
    if (ids.length === 0) return [];
    return getDb().selectFrom("forms").selectAll()
      .where("churchId", "=", churchId)
      .where("removed", "=", false)
      .where("id", "in", ids)
      .orderBy("name")
      .execute();
  }

  public async loadForGroup(churchId: string, groupId: string) {
    return getDb().selectFrom("forms").selectAll()
      .where("churchId", "=", churchId)
      .where("groupId", "=", groupId)
      .where("removed", "=", false)
      .where("archived", "=", false)
      .orderBy("name")
      .execute();
  }

  public async loadNonMemberForms(churchId: string) {
    return getDb().selectFrom("forms").selectAll()
      .where("contentType", "<>", "form")
      .where("churchId", "=", churchId)
      .where("removed", "=", false)
      .where("archived", "=", false)
      .execute();
  }

  public async loadNonMemberArchivedForms(churchId: string) {
    return getDb().selectFrom("forms").selectAll()
      .where("contentType", "<>", "form")
      .where("churchId", "=", churchId)
      .where("removed", "=", false)
      .where("archived", "=", true)
      .execute();
  }

  public async loadMemberForms(churchId: string, personId: string) {
    return getDb().selectFrom("forms as f")
      .leftJoin("memberPermissions as mp", "mp.contentId", "f.id")
      .selectAll("f")
      .select("mp.action")
      .where("mp.memberId", "=", personId)
      .where("f.churchId", "=", churchId)
      .where("f.removed", "=", sql<boolean>`${0}`)
      .where("f.archived", "=", sql<boolean>`${0}`)
      .execute();
  }

  public async loadMemberArchivedForms(churchId: string, personId: string) {
    return getDb().selectFrom("forms as f")
      .leftJoin("memberPermissions as mp", "mp.contentId", "f.id")
      .selectAll("f")
      .where("mp.memberId", "=", personId)
      .where("f.churchId", "=", churchId)
      .where("f.removed", "=", sql<boolean>`${0}`)
      .where("f.archived", "=", sql<boolean>`${1}`)
      .execute();
  }

  public async loadWithMemberPermissions(churchId: string, formId: string, personId: string) {
    return (await getDb().selectFrom("forms as f")
      .leftJoin("memberPermissions as mp", "mp.contentId", "f.id")
      .selectAll("f")
      .select("mp.action")
      .where("f.id", "=", formId)
      .where("f.churchId", "=", churchId)
      .where("mp.memberId", "=", personId)
      .where("f.removed", "=", sql<boolean>`${0}`)
      .where("f.archived", "=", sql<boolean>`${0}`)
      .executeTakeFirst()) ?? null;
  }

  public async access(id: string) {
    return (await getDb().selectFrom("forms")
      .select([
        "id", "name", "restricted", "churchId", "autoCreatePerson", "groupId", "followUpSubject", "followUpBody", "accessStartTime", "accessEndTime"
      ])
      .where("id", "=", id)
      .where("removed", "=", sql<boolean>`${0}`)
      .where("archived", "=", sql<boolean>`${0}`)
      .executeTakeFirst()) ?? null;
  }

  public saveAll(models: Form[]) {
    const promises: Promise<Form>[] = [];
    models.forEach((model) => { promises.push(this.save(model)); });
    return Promise.all(promises);
  }

  public insert(model: Form): Promise<Form> {
    return this.create(model);
  }

  protected rowToModel(row: Form): Form {
    return {
      id: row.id,
      churchId: row.churchId,
      name: row.name,
      description: row.description,
      contentType: row.contentType,
      createdTime: row.createdTime,
      modifiedTime: row.modifiedTime,
      accessStartTime: row.accessStartTime,
      accessEndTime: row.accessEndTime,
      restricted: row.restricted,
      archived: row.archived,
      action: row.action,
      thankYouMessage: row.thankYouMessage,
      photoUrl: row.photoUrl,
      displayMode: row.displayMode,
      autoCreatePerson: row.autoCreatePerson,
      groupId: row.groupId,
      followUpSubject: row.followUpSubject,
      followUpBody: row.followUpBody
    };
  }

  public convertToModel(_churchId: string, data: Form) {
    if (!data) return null;
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: Form[]) {
    if (!Array.isArray(data)) return [];
    return data.map((d) => this.rowToModel(d));
  }
}
