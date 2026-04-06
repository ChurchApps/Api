import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { FormSubmission } from "../models/index.js";
import { DateHelper } from "../helpers/index.js";

@injectable()
export class FormSubmissionRepo {
  public async save(model: FormSubmission) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(formSubmission: FormSubmission): Promise<FormSubmission> {
    formSubmission.id = UniqueIdHelper.shortId();
    const submissionDate = DateHelper.toMysqlDate(formSubmission.submissionDate);
    const revisionDate = DateHelper.toMysqlDate(formSubmission.revisionDate);
    await getDb().insertInto("formSubmissions").values({
      id: formSubmission.id,
      churchId: formSubmission.churchId,
      formId: formSubmission.formId,
      contentType: formSubmission.contentType,
      contentId: formSubmission.contentId,
      submissionDate: submissionDate as any,
      submittedBy: formSubmission.submittedBy,
      revisionDate: revisionDate as any,
      revisedBy: formSubmission.revisedBy
    }).execute();
    return formSubmission;
  }

  private async update(formSubmission: FormSubmission): Promise<FormSubmission> {
    await getDb().updateTable("formSubmissions").set({
      contentId: formSubmission.contentId,
      revisedBy: formSubmission.revisedBy,
      revisionDate: sql`NOW()` as any
    }).where("id", "=", formSubmission.id).where("churchId", "=", formSubmission.churchId).execute();
    return formSubmission;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("formSubmissions").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("formSubmissions").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("formSubmissions").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadForContent(churchId: string, contentType: string, contentId: string) {
    return getDb().selectFrom("formSubmissions").selectAll()
      .where("churchId", "=", churchId)
      .where("contentType", "=", contentType)
      .where("contentId", "=", contentId)
      .execute();
  }

  public async loadByFormId(churchId: string, formId: string) {
    return getDb().selectFrom("formSubmissions").selectAll()
      .where("churchId", "=", churchId)
      .where("formId", "=", formId)
      .execute();
  }

  public saveAll(models: FormSubmission[]) {
    const promises: Promise<FormSubmission>[] = [];
    models.forEach((model) => { promises.push(this.save(model)); });
    return Promise.all(promises);
  }

  public insert(model: FormSubmission): Promise<FormSubmission> {
    return this.create(model);
  }

  protected rowToModel(row: any): FormSubmission {
    return {
      id: row.id,
      churchId: row.churchId,
      formId: row.formId,
      contentType: row.contentType,
      contentId: row.contentId,
      submissionDate: row.submissionDate,
      submittedBy: row.submittedBy,
      revisionDate: row.revisionDate,
      revisedBy: row.revisedBy
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
