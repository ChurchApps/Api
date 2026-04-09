import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Assignment } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class AssignmentRepo {
  public async save(model: Assignment) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Assignment): Promise<Assignment> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("assignments").values({ id: model.id, churchId: model.churchId, positionId: model.positionId, personId: model.personId, status: model.status, notified: model.notified }).execute();
    return model;
  }

  private async update(model: Assignment): Promise<Assignment> {
    await getDb().updateTable("assignments").set({ positionId: model.positionId, personId: model.personId, status: model.status, notified: model.notified }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
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

  public async loadByPlanId(churchId: string, planId: string): Promise<any[]> {
    return getDb().selectFrom("assignments as a")
      .innerJoin("positions as p", "p.id", "a.positionId")
      .selectAll("a")
      .select("p.planId")
      .where("a.churchId", "=", churchId)
      .where("p.planId", "=", planId)
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

  public async loadLastServed(churchId: string) {
    return getDb().selectFrom("assignments as a")
      .innerJoin("positions as p", "p.id", "a.positionId")
      .innerJoin("plans as pl", "pl.id", "p.planId")
      .select(["a.personId", sql`max(pl.serviceDate)`.as("serviceDate")])
      .where("a.churchId", "=", churchId)
      .groupBy("a.personId")
      .orderBy(sql`max(pl.serviceDate)`)
      .execute();
  }

  public async loadByByPersonId(churchId: string, personId: string) {
    return getDb().selectFrom("assignments").selectAll().where("churchId", "=", churchId).where("personId", "=", personId).execute();
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
      .where("pl.serviceDate", ">=", sql`DATE_ADD(CURDATE(), INTERVAL 2 DAY)` as any)
      .where("pl.serviceDate", "<", sql`DATE_ADD(CURDATE(), INTERVAL 3 DAY)` as any);

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
        "p.categoryName",
        sql`p.name`.as("positionName"),
        sql`p.count`.as("needed"),
        "a.personId",
        "a.status"
      ])
      .where("pl.churchId", "=", churchId)
      .where("pl.serviceDate", ">=", startDate as any)
      .where("pl.serviceDate", "<=", endDate as any);

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
