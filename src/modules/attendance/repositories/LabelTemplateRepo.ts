import { UniqueIdHelper } from "@churchapps/apihelper";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { getDb } from "../db/index.js";
import { LabelTemplate } from "../models/index.js";

export class LabelTemplateRepo {
  public async save(model: LabelTemplate) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: LabelTemplate): Promise<LabelTemplate> {
    model.id = UniqueIdHelper.shortId();
    const now = DateHelper.toMysqlDate(new Date());
    await getDb().insertInto("labelTemplates").values({
      id: model.id,
      churchId: model.churchId,
      name: model.name,
      labelType: model.labelType,
      width: model.width,
      height: model.height,
      isDefault: model.isDefault,
      content: model.content,
      createdDate: now as any,
      modifiedDate: now as any
    }).execute();
    return model;
  }

  private async update(model: LabelTemplate): Promise<LabelTemplate> {
    await getDb().updateTable("labelTemplates").set({
      name: model.name,
      labelType: model.labelType,
      width: model.width,
      height: model.height,
      isDefault: model.isDefault,
      content: model.content,
      modifiedDate: DateHelper.toMysqlDate(new Date()) as any
    }).where("id", "=", model.id)
      .where("churchId", "=", model.churchId)
      .execute();
    return model;
  }

  public async clearOtherDefaults(churchId: string, labelType: string, exceptId: string) {
    await getDb().updateTable("labelTemplates").set({ isDefault: false }).where("churchId", "=", churchId).where("labelType", "=", labelType).where("id", "!=", exceptId).execute();
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("labelTemplates").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("labelTemplates").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("labelTemplates").selectAll().where("churchId", "=", churchId).orderBy("name").execute();
  }

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : data;
  }

  public convertAllToModel(_churchId: string, data: any[]): LabelTemplate[] {
    return data.map((row) => this.rowToModel(row));
  }

  protected rowToModel(row: any): LabelTemplate {
    return {
      id: row.id,
      churchId: row.churchId,
      name: row.name,
      labelType: row.labelType,
      width: row.width,
      height: row.height,
      isDefault: row.isDefault === true || row.isDefault === 1,
      content: row.content,
      createdDate: row.createdDate,
      modifiedDate: row.modifiedDate
    };
  }
}
