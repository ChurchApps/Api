import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Condition } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class ConditionRepo {
  public async save(model: Condition) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Condition): Promise<Condition> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("conditions").values({
      id: model.id, churchId: model.churchId, conjunctionId: model.conjunctionId, field: model.field, fieldData: model.fieldData, operator: model.operator, value: model.value, label: model.label
    }).execute();
    return model;
  }

  private async update(model: Condition): Promise<Condition> {
    await getDb().updateTable("conditions").set({
      conjunctionId: model.conjunctionId, field: model.field, fieldData: model.fieldData, operator: model.operator, value: model.value, label: model.label
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("conditions").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("conditions").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("conditions").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadForAutomation(churchId: string, automationId: string) {
    return getDb().selectFrom("conditions").selectAll()
      .where("conjunctionId", "in",
        getDb().selectFrom("conjunctions").select("id").where("automationId", "=", automationId)
      )
      .where("churchId", "=", churchId)
      .execute();
  }
}
