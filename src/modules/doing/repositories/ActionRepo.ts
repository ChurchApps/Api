import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Action } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class ActionRepo {
  public async save(model: Action) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Action): Promise<Action> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("actions").values({
      id: model.id, churchId: model.churchId, automationId: model.automationId, actionType: model.actionType, actionData: model.actionData
    }).execute();
    return model;
  }

  private async update(model: Action): Promise<Action> {
    await getDb().updateTable("actions").set({
      automationId: model.automationId, actionType: model.actionType, actionData: model.actionData
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("actions").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("actions").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("actions").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadForAutomation(churchId: string, automationId: string) {
    return getDb().selectFrom("actions").selectAll().where("automationId", "=", automationId).where("churchId", "=", churchId).execute();
  }
}
