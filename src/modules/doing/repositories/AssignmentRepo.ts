import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Assignment } from "../models/index.js";
import { getDb } from "../db/index.js";
import { mysqlValue } from "./sqlValues.js";
import { cleanDeclineReason } from "../helpers/DeclineReason.js";

@injectable()
export class AssignmentRepo {
  public async save(model: Assignment) {
    return model.id ? this.update(model) : this.create(model);
  }

  // A reason only belongs to a decline; undefined leaves the stored value alone (Kysely skips it).
  private static declineReasonFor(model: Assignment): string | null | undefined {
    if (model.status !== "Declined") return null;
    if (model.declineReason === undefined) return undefined;
    return cleanDeclineReason(model.declineReason);
  }

  // Issuance is an explicit command. Saves/imports cannot enroll an assignment.
  public async issueConfirmation(churchId: string, id: string, workflowId: string): Promise<boolean> {
    const result = await getDb().updateTable("assignments").set({ confirmationWorkflowId: workflowId, notified: new Date() })
      .where("churchId", "=", churchId).where("id", "=", id).where("status", "=", "Unconfirmed")
      .where("notified", "is", null).where("confirmationWorkflowId", "is", null).executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  public async loadIssuedConfirmations(): Promise<Assignment[]> {
    return getDb().selectFrom("assignments as a").leftJoin("tasks as t", (j) =>
      j.onRef("t.churchId", "=", "a.churchId").onRef("t.followupKey", "=", "a.id"))
      .selectAll("a").where("a.confirmationWorkflowId", "is not", null)
      .where("a.status", "=", "Unconfirmed").where("t.id", "is", null).execute();
  }

  private async create(model: Assignment): Promise<Assignment> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("assignments").values({ id: model.id, churchId: model.churchId, positionId: model.positionId, personId: model.personId, status: model.status, notified: model.notified, autofillRunId: model.autofillRunId, declineReason: AssignmentRepo.declineReasonFor(model) }).execute();
    return model;
  }

  private async update(model: Assignment): Promise<Assignment> {
    await getDb().updateTable("assignments").set({ positionId: model.positionId, personId: model.personId, status: model.status, notified: model.notified, autofillRunId: model.autofillRunId, declineReason: AssignmentRepo.declineReasonFor(model) }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("assignments").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("assignments").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("assignments").selectAll().where("churchId", "=", churchId).execute();
  }

  public async deleteByPlanId(churchId: string, planId: string) {
    await getDb().deleteFrom("assignments")
      .where("churchId", "=", churchId)
      .where("positionId", "in", getDb().selectFrom("positions").select("id").where("planId", "=", planId))
      .execute();
  }

  public async loadByPlanId(churchId: string, planId: string) {
    return getDb().selectFrom("assignments as a")
      .innerJoin("positions as p", "p.id", "a.positionId")
      .selectAll("a")
      .select("p.planId")
      .where("a.churchId", "=", churchId)
      .where("p.planId", "=", planId)
      .execute();
  }

  // Non-declined assignments on a plan, with position label, for reminders.
  public async loadForReminder(churchId: string, planId: string) {
    return getDb().selectFrom("assignments as a")
      .innerJoin("positions as p", (j) => j.onRef("p.id", "=", "a.positionId").onRef("p.churchId", "=", "a.churchId"))
      .innerJoin("plans as pl", (j) => j.onRef("pl.id", "=", "p.planId").onRef("pl.churchId", "=", "a.churchId"))
      .select([
        "a.id",
        "a.personId",
        "a.status",
        sql`p.name`.as("positionName"),
        "p.categoryName"
      ])
      .where("a.churchId", "=", churchId)
      .where("p.planId", "=", planId)
      .where((eb) => eb.or([eb("pl.prepared", "is", null), eb("pl.prepared", "=", false)]))
      .where((eb) => eb.or([eb("a.status", "=", "Accepted"), eb.and([eb("a.status", "=", "Unconfirmed"), eb("a.confirmationWorkflowId", "is", null)])]))
      .execute();
  }

  public async loadByPlanIds(churchId: string, planIds: string[]) {
    if (planIds.length === 0) return [];
    return getDb().selectFrom("assignments as a")
      .innerJoin("positions as p", "p.id", "a.positionId")
      .selectAll("a")
      .where("a.churchId", "=", churchId)
      .where("p.planId", "in", planIds)
      .execute();
  }

  // With `before`, only non-declined assignments on earlier plans count, so the picker never shows a future or declined date.
  public async loadLastServed(churchId: string, options?: { personIds?: string[]; before?: Date }) {
    if (options?.personIds && options.personIds.length === 0) return [];
    let query = getDb().selectFrom("assignments as a")
      .innerJoin("positions as p", "p.id", "a.positionId")
      .innerJoin("plans as pl", "pl.id", "p.planId")
      .select(["a.personId", sql`max(pl.serviceDate)`.as("serviceDate")])
      .where("a.churchId", "=", churchId);
    if (options?.personIds) query = query.where("a.personId", "in", options.personIds);
    if (options?.before) {
      query = query.where(sql`DATE(pl.serviceDate)`, "<", sql`DATE(${options.before})`)
        .where((eb) => eb.or([eb("a.status", "is", null), eb("a.status", "!=", "Declined")]));
    }
    return query.groupBy("a.personId").orderBy(sql`max(pl.serviceDate)`).execute();
  }

  // Non-declined assignments these people hold on any plan that day, other than the given position.
  public async loadSameDayForPeople(churchId: string, serviceDate: Date, personIds: string[], excludePositionId?: string) {
    if (personIds.length === 0) return [];
    let query = getDb().selectFrom("assignments as a")
      .innerJoin("positions as p", (j) => j.onRef("p.id", "=", "a.positionId").onRef("p.churchId", "=", "a.churchId"))
      .innerJoin("plans as pl", (j) => j.onRef("pl.id", "=", "p.planId").onRef("pl.churchId", "=", "a.churchId"))
      .select(["a.personId", "pl.id as planId", "pl.name as planName", "p.name as positionName"])
      .where("a.churchId", "=", churchId)
      .where("a.personId", "in", personIds)
      .where(sql`DATE(pl.serviceDate)`, "=", sql`DATE(${serviceDate})`)
      .where((eb) => eb.or([eb("a.status", "is", null), eb("a.status", "!=", "Declined")]));
    if (excludePositionId) query = query.where("a.positionId", "!=", excludePositionId);
    return query.execute();
  }

  // Member-facing: penciled-in (prepared) plans stay hidden until published.
  public async loadByByPersonId(churchId: string, personId: string) {
    return getDb().selectFrom("assignments as a")
      .innerJoin("positions as p", "p.id", "a.positionId")
      .innerJoin("plans as pl", "pl.id", "p.planId")
      .selectAll("a")
      .where("a.churchId", "=", churchId)
      .where("a.personId", "=", personId)
      .where((eb) => eb.or([eb("pl.prepared", "is", null), eb("pl.prepared", "=", false)]))
      .execute();
  }

  // A day back so a plan later today in the member's timezone isn't dropped; the client trims to its own today.
  public async loadUpcomingByPersonId(churchId: string, personId: string) {
    return getDb().selectFrom("assignments as a")
      .innerJoin("positions as p", "p.id", "a.positionId")
      .innerJoin("plans as pl", "pl.id", "p.planId")
      .select(["a.id as assignmentId", "a.status", "p.name as positionName", "pl.id as planId", "pl.name as planName", "pl.serviceDate"])
      .where("a.churchId", "=", churchId)
      .where("a.personId", "=", personId)
      .where("pl.serviceDate", ">=", sql<Date>`DATE_SUB(CURDATE(), INTERVAL 1 DAY)`)
      .where((eb) => eb.or([eb("pl.prepared", "is", null), eb("pl.prepared", "=", false)]))
      .orderBy("pl.serviceDate")
      .limit(20)
      .execute();
  }

  // Calendar feed: the person's accepted, published assignments from 60 days back onward.
  public async loadAcceptedForFeed(churchId: string, personId: string) {
    return getDb().selectFrom("assignments as a")
      .innerJoin("positions as p", (j) => j.onRef("p.id", "=", "a.positionId").onRef("p.churchId", "=", "a.churchId"))
      .innerJoin("plans as pl", (j) => j.onRef("pl.id", "=", "p.planId").onRef("pl.churchId", "=", "a.churchId"))
      .select(["a.id as assignmentId", "p.name as positionName", "p.categoryName", "pl.id as planId", "pl.name as planName", "pl.serviceDate"])
      .where("a.churchId", "=", churchId)
      .where("a.personId", "=", personId)
      .where("a.status", "=", "Accepted")
      .where("pl.serviceDate", ">=", sql<Date>`DATE_SUB(CURDATE(), INTERVAL 60 DAY)`)
      .where((eb) => eb.or([eb("pl.prepared", "is", null), eb("pl.prepared", "=", false)]))
      .orderBy("pl.serviceDate")
      .limit(500)
      .execute();
  }

  // Non-declined assignments per person for plans in the calendar month of the given date.
  public async loadMonthServeCounts(churchId: string, serviceDate: Date): Promise<{ personId: string; count: number }[]> {
    const rows = await getDb().selectFrom("assignments as a")
      .innerJoin("positions as p", "p.id", "a.positionId")
      .innerJoin("plans as pl", "pl.id", "p.planId")
      .select(["a.personId", sql<number>`COUNT(*)`.as("count")])
      .where("a.churchId", "=", churchId)
      .where((eb) => eb.or([eb("a.status", "is", null), eb("a.status", "!=", "Declined")]))
      .where(sql`YEAR(pl.serviceDate)`, "=", sql`YEAR(${serviceDate})`)
      .where(sql`MONTH(pl.serviceDate)`, "=", sql`MONTH(${serviceDate})`)
      .groupBy("a.personId")
      .execute();
    return rows;
  }

  public async deleteUnconfirmedByRunId(churchId: string, autofillRunId: string) {
    const result = await getDb().deleteFrom("assignments")
      .where("churchId", "=", churchId)
      .where("autofillRunId", "=", autofillRunId)
      .where("status", "=", "Unconfirmed")
      .executeTakeFirst();
    return Number(result?.numDeletedRows ?? 0);
  }

  // People assigned to a position on a plan whose serviceDate falls in the window;
  // no window means anyone ever assigned.
  public async loadPersonIdsByServiceDateRange(churchId: string, startDate?: Date, endDate?: Date): Promise<string[]> {
    let query = getDb().selectFrom("assignments as a")
      .innerJoin("positions as p", "p.id", "a.positionId")
      .innerJoin("plans as pl", "pl.id", "p.planId")
      .select("a.personId")
      .distinct()
      .where("a.churchId", "=", churchId);
    if (startDate) query = query.where("pl.serviceDate", ">=", startDate);
    if (endDate) query = query.where("pl.serviceDate", "<=", endDate);
    const rows = await query.execute();
    return rows.map((r) => r.personId).filter((id: string) => !!id);
  }

  public async loadUnconfirmedByServiceDateRange(churchId?: string) {
    let query = getDb().selectFrom("assignments as a")
      .innerJoin("positions as p", "p.id", "a.positionId")
      .innerJoin("plans as pl", "pl.id", "p.planId")
      .select([
        "a.id",
        "a.churchId",
        "a.positionId",
        "a.personId",
        "a.status",
        "a.notified",
        "pl.serviceDate",
        sql`pl.name`.as("planName")
      ])
      .where("a.status", "=", "Unconfirmed")
      .where("pl.serviceDate", ">=", sql<Date>`DATE_ADD(CURDATE(), INTERVAL 2 DAY)`)
      .where("pl.serviceDate", "<", sql<Date>`DATE_ADD(CURDATE(), INTERVAL 3 DAY)`);

    if (churchId) {
      query = query.where("a.churchId", "=", churchId);
    }

    return query.execute();
  }

  public async countByPositionId(churchId: string, positionId: string) {
    return (await getDb().selectFrom("assignments")
      .select(sql<number>`COUNT(*)`.as("cnt"))
      .where("churchId", "=", churchId)
      .where("positionId", "=", positionId)
      .where("status", "in", ["Accepted", "Unconfirmed"])
      .executeTakeFirst()) ?? null;
  }

  public async loadOverviewByDateRange(churchId: string, startDate: string, endDate: string, ministryId?: string, planTypeId?: string) {
    let query = getDb().selectFrom("positions as p")
      .innerJoin("plans as pl", "pl.id", "p.planId")
      .leftJoin("assignments as a", (join) =>
        join.onRef("a.positionId", "=", "p.id").on("a.status", "in", ["Accepted", "Unconfirmed"]))
      .select([
        "pl.serviceDate",
        "pl.ministryId",
        sql`pl.id`.as("planId"),
        sql`pl.name`.as("planName"),
        sql`p.id`.as("positionId"),
        "p.categoryName",
        sql`p.name`.as("positionName"),
        "p.groupId",
        sql`p.count`.as("needed"),
        sql`a.id`.as("assignmentId"),
        "a.personId",
        "a.status"
      ])
      .where("pl.churchId", "=", churchId)
      .where("pl.serviceDate", ">=", mysqlValue<Date>(startDate))
      .where("pl.serviceDate", "<=", mysqlValue<Date>(endDate));

    if (ministryId) {
      query = query.where("pl.ministryId", "=", ministryId);
    }
    if (planTypeId) {
      query = query.where("pl.planTypeId", "=", planTypeId);
    }

    return query.orderBy("p.categoryName").orderBy("p.name").orderBy("pl.serviceDate").execute();
  }

  public async loadByServiceDate(churchId: string, serviceDate: Date, excludePlanId?: string) {
    let query = getDb().selectFrom("assignments as a")
      .innerJoin("positions as p", "p.id", "a.positionId")
      .innerJoin("plans as pl", "pl.id", "p.planId")
      .selectAll("a")
      .where("a.churchId", "=", churchId)
      .where(sql`DATE(pl.serviceDate)`, "=", sql`DATE(${serviceDate})`);

    if (excludePlanId) {
      query = query.where("pl.id", "!=", excludePlanId);
    }

    return query.execute();
  }
}
