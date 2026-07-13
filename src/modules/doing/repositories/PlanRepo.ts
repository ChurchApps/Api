import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Plan } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class PlanRepo {
  public async save(model: Plan) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Plan): Promise<Plan> {
    model.id = model.id || UniqueIdHelper.shortId();
    await getDb().insertInto("plans").values({
      id: model.id,
      churchId: model.churchId,
      ministryId: model.ministryId,
      campusId: model.campusId,
      planTypeId: model.planTypeId,
      name: model.name,
      serviceDate: (model.serviceDate?.toISOString().split("T")[0] || new Date().toISOString().split("T")[0]) as any,
      notes: model.notes,
      serviceOrder: model.serviceOrder,
      contentType: model.contentType,
      contentId: model.contentId,
      providerId: model.providerId,
      providerPlanId: model.providerPlanId,
      providerPlanName: model.providerPlanName,
      signupDeadlineHours: model.signupDeadlineHours,
      showVolunteerNames: model.showVolunteerNames,
      prepared: model.prepared,
      autoReplaceOnDecline: model.autoReplaceOnDecline,
      lastAutofillRunId: model.lastAutofillRunId
    }).execute();
    return model;
  }

  private async update(model: Plan): Promise<Plan> {
    await getDb().updateTable("plans").set({
      ministryId: model.ministryId,
      campusId: model.campusId,
      planTypeId: model.planTypeId,
      name: model.name,
      serviceDate: (model.serviceDate?.toISOString().split("T")[0] || new Date().toISOString().split("T")[0]) as any,
      notes: model.notes,
      serviceOrder: model.serviceOrder,
      contentType: model.contentType,
      contentId: model.contentId,
      providerId: model.providerId,
      providerPlanId: model.providerPlanId,
      providerPlanName: model.providerPlanName,
      signupDeadlineHours: model.signupDeadlineHours,
      showVolunteerNames: model.showVolunteerNames,
      prepared: model.prepared,
      autoReplaceOnDecline: model.autoReplaceOnDecline,
      lastAutofillRunId: model.lastAutofillRunId
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("plans").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  // Targeted update — a full save() would round-trip serviceDate through toISOString.
  public async updateLastAutofillRunId(churchId: string, planId: string, runId: string | null) {
    await getDb().updateTable("plans").set({ lastAutofillRunId: runId }).where("id", "=", planId).where("churchId", "=", churchId).execute();
  }

  // Scope expansion source: plans of a planType with serviceDate inside the reminder horizon.
  public async loadByPlanTypeIdInRange(churchId: string, planTypeId: string, from: Date, to: Date) {
    return getDb().selectFrom("plans").selectAll()
      .where("churchId", "=", churchId)
      .where("planTypeId", "=", planTypeId)
      .where("serviceDate", ">=", (from.toISOString().split("T")[0]) as any)
      .where("serviceDate", "<=", (to.toISOString().split("T")[0]) as any)
      .execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("plans").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("plans").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadByIds(churchId: string, ids: string[]) {
    if (ids.length === 0) return [];
    return getDb().selectFrom("plans").selectAll().where("churchId", "=", churchId).where("id", "in", ids).execute();
  }

  public async load7Days(churchId: string) {
    return getDb().selectFrom("plans").selectAll()
      .where("churchId", "=", churchId)
      .where("serviceDate", ">=", sql`CURDATE()` as any)
      .where("serviceDate", "<=", sql`CURDATE() + INTERVAL 7 DAY` as any)
      .orderBy("serviceDate", "desc")
      .execute();
  }

  public async loadByPlanTypeId(churchId: string, planTypeId: string) {
    return getDb().selectFrom("plans").selectAll()
      .where("churchId", "=", churchId)
      .where("planTypeId", "=", planTypeId)
      .orderBy("serviceDate", "desc")
      .execute();
  }

  public async loadCurrentByPlanTypeId(planTypeId: string) {
    // One-day grace so a screen can still pull up yesterday's service (Sunday's lesson on Monday)
    return (await getDb().selectFrom("plans").selectAll()
      .where("planTypeId", "=", planTypeId)
      .where("serviceDate", ">=", sql`CURDATE() - INTERVAL 1 DAY` as any)
      .orderBy("serviceDate")
      .limit(1)
      .executeTakeFirst()) ?? null;
  }

  public async loadSignupPlans(churchId: string) {
    return getDb().selectFrom("plans as p")
      .innerJoin("positions as pos", (join) =>
        join.onRef("pos.planId", "=", "p.id").onRef("pos.churchId", "=", "p.churchId"))
      .selectAll("p")
      .distinct()
      .where("p.churchId", "=", churchId)
      .where("pos.allowSelfSignup", "=", true as any)
      .where((eb) => eb.or([eb("p.prepared", "is", null), eb("p.prepared", "=", false as any)]))
      .where("p.serviceDate", ">=", sql`CURDATE()` as any)
      .orderBy("p.serviceDate", "asc")
      .execute();
  }
}
