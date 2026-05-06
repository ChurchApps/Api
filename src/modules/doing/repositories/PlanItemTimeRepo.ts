import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { PlanItemTime } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class PlanItemTimeRepo {
  public async save(model: PlanItemTime) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: PlanItemTime): Promise<PlanItemTime> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("planItemTimes").values({ id: model.id, churchId: model.churchId, planItemId: model.planItemId, timeId: model.timeId, excluded: model.excluded ? 1 : 0 } as any).execute();
    return model;
  }

  private async update(model: PlanItemTime): Promise<PlanItemTime> {
    await getDb().updateTable("planItemTimes").set({ planItemId: model.planItemId, timeId: model.timeId, excluded: model.excluded ? 1 : 0 } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("planItemTimes").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async deleteByPlanItemId(churchId: string, planItemId: string) {
    await getDb().deleteFrom("planItemTimes").where("churchId", "=", churchId).where("planItemId", "=", planItemId).execute();
  }

  public async deleteByPlanId(churchId: string, planId: string) {
    const itemIds = await getDb().selectFrom("planItems").select("id").where("churchId", "=", churchId).where("planId", "=", planId).execute();
    const ids = itemIds.map((r: any) => r.id).filter(Boolean);
    if (ids.length === 0) return;
    await getDb().deleteFrom("planItemTimes").where("churchId", "=", churchId).where("planItemId", "in", ids).execute();
  }

  public async deleteByPlanItemAndTime(churchId: string, planItemId: string, timeId: string) {
    await getDb().deleteFrom("planItemTimes").where("churchId", "=", churchId).where("planItemId", "=", planItemId).where("timeId", "=", timeId).execute();
  }

  public async deleteByTimeId(churchId: string, timeId: string) {
    await getDb().deleteFrom("planItemTimes").where("churchId", "=", churchId).where("timeId", "=", timeId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("planItemTimes").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadByPlanItemId(churchId: string, planItemId: string) {
    return getDb().selectFrom("planItemTimes").selectAll().where("churchId", "=", churchId).where("planItemId", "=", planItemId).execute();
  }

  public async loadByPlanId(churchId: string, planId: string) {
    return getDb()
      .selectFrom("planItemTimes")
      .innerJoin("planItems", "planItems.id", "planItemTimes.planItemId")
      .where("planItemTimes.churchId", "=", churchId)
      .where("planItems.planId", "=", planId)
      .select(["planItemTimes.id", "planItemTimes.churchId", "planItemTimes.planItemId", "planItemTimes.timeId", "planItemTimes.excluded"])
      .execute();
  }
}
