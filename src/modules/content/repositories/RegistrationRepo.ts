import { DateHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { Registration } from "../models/index.js";
import { injectable } from "inversify";

@injectable()
export class RegistrationRepo {
  public async save(model: Registration) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Registration): Promise<Registration> {
    model.id = UniqueIdHelper.shortId();
    const m: any = { ...model };
    if (m.registeredDate) m.registeredDate = DateHelper.toMysqlDate(m.registeredDate);
    if (m.cancelledDate) m.cancelledDate = DateHelper.toMysqlDate(m.cancelledDate);
    if (m.waitlistNotifiedDate) m.waitlistNotifiedDate = DateHelper.toMysqlDate(m.waitlistNotifiedDate);
    await getDb().insertInto("registrations").values({
      id: model.id,
      churchId: model.churchId,
      eventId: m.eventId,
      personId: m.personId,
      householdId: m.householdId,
      status: m.status,
      formSubmissionId: m.formSubmissionId,
      notes: m.notes,
      registeredDate: m.registeredDate,
      cancelledDate: m.cancelledDate,
      totalAmount: m.totalAmount ?? null,
      amountPaid: m.amountPaid ?? 0,
      couponId: m.couponId ?? null,
      waitlistNotifiedDate: m.waitlistNotifiedDate ?? null
    } as any).execute();
    return model;
  }

  private async update(model: Registration): Promise<Registration> {
    const m: any = { ...model };
    if (m.registeredDate) m.registeredDate = DateHelper.toMysqlDate(m.registeredDate);
    if (m.cancelledDate) m.cancelledDate = DateHelper.toMysqlDate(m.cancelledDate);
    if (m.waitlistNotifiedDate) m.waitlistNotifiedDate = DateHelper.toMysqlDate(m.waitlistNotifiedDate);
    await getDb().updateTable("registrations").set({
      eventId: m.eventId,
      personId: m.personId,
      householdId: m.householdId,
      status: m.status,
      formSubmissionId: m.formSubmissionId,
      notes: m.notes,
      registeredDate: m.registeredDate,
      cancelledDate: m.cancelledDate,
      totalAmount: m.totalAmount ?? null,
      amountPaid: m.amountPaid ?? 0,
      couponId: m.couponId ?? null,
      waitlistNotifiedDate: m.waitlistNotifiedDate ?? null
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("registrations").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Registration | undefined> {
    return (await getDb().selectFrom("registrations").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<Registration[]> {
    return getDb().selectFrom("registrations").selectAll().where("churchId", "=", churchId).execute() as any;
  }

  public async loadForEvent(churchId: string, eventId: string): Promise<Registration[]> {
    return getDb().selectFrom("registrations").selectAll()
      .where("churchId", "=", churchId)
      .where("eventId", "=", eventId)
      .orderBy("registeredDate").execute() as any;
  }

  public async loadForPerson(churchId: string, personId: string): Promise<Registration[]> {
    return getDb().selectFrom("registrations").selectAll()
      .where("churchId", "=", churchId)
      .where("personId", "=", personId)
      .orderBy("registeredDate", "desc").execute() as any;
  }

  public async loadForHousehold(churchId: string, householdId: string): Promise<Registration[]> {
    return getDb().selectFrom("registrations").selectAll()
      .where("churchId", "=", churchId)
      .where("householdId", "=", householdId)
      .orderBy("registeredDate", "desc").execute() as any;
  }

  public async countActiveForEvent(churchId: string, eventId: string): Promise<number> {
    const result = await getDb().selectFrom("registrations")
      .select(sql<number>`COUNT(*)`.as("cnt"))
      .where("churchId", "=", churchId)
      .where("eventId", "=", eventId)
      .where("status", "in", ["pending", "confirmed"])
      .executeTakeFirst();
    return (result as any)?.cnt || 0;
  }

  public async countActiveForCoupon(churchId: string, couponId: string): Promise<number> {
    const result = await getDb().selectFrom("registrations")
      .select(sql<number>`COUNT(*)`.as("cnt"))
      .where("churchId", "=", churchId)
      .where("couponId", "=", couponId)
      .where("status", "in", ["pending", "confirmed"])
      .executeTakeFirst();
    return (result as any)?.cnt || 0;
  }

  public async atomicInsertWithCapacityCheck(registration: Registration, capacity: number | null): Promise<boolean> {
    const m: any = { ...registration };
    if (!m.id) m.id = UniqueIdHelper.shortId();
    if (m.registeredDate) m.registeredDate = DateHelper.toMysqlDate(m.registeredDate);

    const values = {
      id: m.id,
      churchId: m.churchId,
      eventId: m.eventId,
      personId: m.personId || null,
      householdId: m.householdId || null,
      status: m.status || "confirmed",
      formSubmissionId: m.formSubmissionId || null,
      notes: m.notes || null,
      registeredDate: m.registeredDate || null,
      cancelledDate: m.cancelledDate || null,
      totalAmount: m.totalAmount ?? null,
      amountPaid: m.amountPaid ?? 0,
      couponId: m.couponId || null,
      waitlistNotifiedDate: m.waitlistNotifiedDate || null
    };

    if (capacity === null || capacity === undefined) {
      await getDb().insertInto("registrations").values(values as any).execute();
      registration.id = m.id;
      return true;
    }

    // Race safety comes from the count-subquery and insert being one atomic MySQL statement.
    const result: any = await sql`INSERT INTO registrations (id, churchId, eventId, personId, householdId, status, formSubmissionId, notes, registeredDate, cancelledDate, totalAmount, amountPaid, couponId, waitlistNotifiedDate)
      SELECT ${values.id}, ${values.churchId}, ${values.eventId}, ${values.personId}, ${values.householdId}, ${values.status}, ${values.formSubmissionId}, ${values.notes}, ${values.registeredDate}, ${values.cancelledDate}, ${values.totalAmount}, ${values.amountPaid}, ${values.couponId}, ${values.waitlistNotifiedDate}
      FROM dual
      WHERE (SELECT COUNT(*) FROM registrations WHERE eventId=${values.eventId} AND churchId=${values.churchId} AND status IN ('pending','confirmed')) < ${capacity}`.execute(getDb());
    if (result?.numAffectedRows > 0n || result?.affectedRows > 0) {
      registration.id = m.id;
      return true;
    }
    return false;
  }

  // Promotes the oldest waitlisted registration to pending if a spot is free.
  // The status='waitlisted' guard makes concurrent promotions safe: only one
  // statement can flip a given row, so nobody is promoted twice or over capacity.
  public async promoteFromWaitlist(churchId: string, eventId: string, capacity: number | null): Promise<Registration | null> {
    const candidate = await getDb().selectFrom("registrations").selectAll()
      .where("churchId", "=", churchId)
      .where("eventId", "=", eventId)
      .where("status", "=", "waitlisted")
      .orderBy("registeredDate").limit(1).executeTakeFirst() as any;
    if (!candidate) return null;

    const cap = capacity === null || capacity === undefined ? Number.MAX_SAFE_INTEGER : capacity;
    const result: any = await sql`UPDATE registrations SET status='pending', waitlistNotifiedDate=NOW()
      WHERE id=${candidate.id} AND churchId=${churchId} AND status='waitlisted'
      AND (SELECT cnt FROM (SELECT COUNT(*) AS cnt FROM registrations WHERE churchId=${churchId} AND eventId=${eventId} AND status IN ('pending','confirmed')) AS used) < ${cap}`.execute(getDb());
    if (result?.numAffectedRows > 0n || result?.affectedRows > 0) {
      return { ...candidate, status: "pending", waitlistNotifiedDate: new Date() };
    }
    return null;
  }

  public convertToModel(_churchId: string, data: any) { return data as Registration; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as Registration[]; }
}
