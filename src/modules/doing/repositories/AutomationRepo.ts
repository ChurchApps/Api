import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Automation } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class AutomationRepo {
  public async save(model: Automation) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Automation): Promise<Automation> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("automations").values({ id: model.id, churchId: model.churchId, title: model.title, recurs: model.recurs, active: model.active }).execute();
    return model;
  }

  private async update(model: Automation): Promise<Automation> {
    await getDb().updateTable("automations").set({ title: model.title, recurs: model.recurs, active: model.active }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("automations").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("automations").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("automations").selectAll().where("churchId", "=", churchId).orderBy("title").execute();
  }

  public async loadAllChurches() {
    return getDb().selectFrom("automations").selectAll().execute();
  }
}
