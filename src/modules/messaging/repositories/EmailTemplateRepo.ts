import { sql } from "kysely";
import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { EmailTemplate } from "../models/index.js";

@injectable()
export class EmailTemplateRepo {
  public async save(model: EmailTemplate) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: EmailTemplate): Promise<EmailTemplate> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("emailTemplates").values({
      id: model.id,
      churchId: model.churchId,
      name: model.name,
      subject: model.subject,
      htmlContent: model.htmlContent,
      category: model.category,
      dateCreated: sql`NOW()`,
      dateModified: sql`NOW()`
    }).execute();
    return model;
  }

  private async update(model: EmailTemplate): Promise<EmailTemplate> {
    await getDb().updateTable("emailTemplates").set({
      name: model.name,
      subject: model.subject,
      htmlContent: model.htmlContent,
      category: model.category,
      dateModified: sql`NOW()`
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async loadByChurchId(churchId: string) {
    return getDb().selectFrom("emailTemplates")
      .select(["id", "churchId", "name", "subject", "category", "dateCreated", "dateModified"])
      .where("churchId", "=", churchId)
      .orderBy("name")
      .execute();
  }

  public async loadById(churchId: string, id: string) {
    return (await getDb().selectFrom("emailTemplates").selectAll()
      .where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("emailTemplates").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  protected rowToModel(data: any): EmailTemplate {
    return {
      id: data.id,
      churchId: data.churchId,
      name: data.name,
      subject: data.subject,
      htmlContent: data.htmlContent,
      category: data.category,
      dateCreated: data.dateCreated,
      dateModified: data.dateModified
    };
  }

  public convertToModel(data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: any[]) {
    return data.map((d: any) => this.rowToModel(d));
  }
}
