import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Conjunction } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class ConjunctionRepo {
  public async save(model: Conjunction) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Conjunction): Promise<Conjunction> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("conjunctions").values({
      id: model.id, churchId: model.churchId, automationId: model.automationId, parentId: model.parentId, groupType: model.groupType
    }).execute();
    return model;
  }

  private async update(model: Conjunction): Promise<Conjunction> {
    await getDb().updateTable("conjunctions").set({
      automationId: model.automationId, parentId: model.parentId, groupType: model.groupType
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("conjunctions").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("conjunctions").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("conjunctions").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadForAutomation(churchId: string, automationId: string) {
    return getDb().selectFrom("conjunctions").selectAll().where("automationId", "=", automationId).where("churchId", "=", churchId).execute();
  }
}
