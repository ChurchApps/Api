import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { EventTemplate } from "../models/index.js";
import { injectable } from "inversify";

@injectable()
export class EventTemplateRepo {
  public async save(model: EventTemplate) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: EventTemplate): Promise<EventTemplate> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("eventTemplates").values({
      id: model.id,
      churchId: model.churchId,
      name: model.name,
      title: model.title,
      description: model.description,
      durationMinutes: model.durationMinutes,
      visibility: model.visibility,
      roomIds: model.roomIds,
      resourcesJson: model.resourcesJson
    } as any).execute();
    return model;
  }

  private async update(model: EventTemplate): Promise<EventTemplate> {
    await getDb().updateTable("eventTemplates").set({
      name: model.name,
      title: model.title,
      description: model.description,
      durationMinutes: model.durationMinutes,
      visibility: model.visibility,
      roomIds: model.roomIds,
      resourcesJson: model.resourcesJson
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("eventTemplates").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<EventTemplate | undefined> {
    return (await getDb().selectFrom("eventTemplates").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<EventTemplate[]> {
    return getDb().selectFrom("eventTemplates").selectAll().where("churchId", "=", churchId).orderBy("name").execute() as any;
  }

  public convertToModel(_churchId: string, data: any) { return data as EventTemplate; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as EventTemplate[]; }
}
