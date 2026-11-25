import { DateHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { Registration } from "../models/index.js";
import { injectable } from "inversify";
import type { MysqlWriteResult } from "./types.js";

@injectable()
export class RegistrationRepo {
  public async save(model: Registration) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Registration): Promise<Registration> {
    model.id = UniqueIdHelper.shortId();
    const registeredDate = model.registeredDate ? DateHelper.toMysqlDate(model.registeredDate) : model.registeredDate;
    const cancelledDate = model.cancelledDate ? DateHelper.toMysqlDate(model.cancelledDate) : model.cancelledDate;
    const waitlistNotifiedDate = model.waitlistNotifiedDate ? DateHelper.toMysqlDate(model.waitlistNotifiedDate) : model.waitlistNotifiedDate;
    await getDb().insertInto("registrations").values({
      id: model.id,
      churchId: model.churchId,
      eventId: model.eventId,
      personId: model.personId,
      householdId: model.householdId,
      status: model.status,
      formSubmissionId: model.formSubmissionId,
      notes: model.notes,
      registeredDate,
      cancelledDate,
      totalAmount: model.totalAmount ?? null,
      amountPaid: model.amountPaid ?? 0,
      couponId: model.couponId ?? null,
      waitlistNotifiedDate: waitlistNotifiedDate ?? null
    }).execute();
    return model;
  }

  private async update(model: Registration): Promise<Registration> {
    const registeredDate = model.registeredDate ? DateHelper.toMysqlDate(model.registeredDate) : model.registeredDate;
    const cancelledDate = model.cancelledDate ? DateHelper.toMysqlDate(model.cancelledDate) : model.cancelledDate;
    const waitlistNotifiedDate = model.waitlistNotifiedDate ? DateHelper.toMysqlDate(model.waitlistNotifiedDate) : model.waitlistNotifiedDate;
    await getDb().updateTable("registrations").set({
      eventId: model.eventId,
      personId: model.personId,
      householdId: model.householdId,
      status: model.status,
      formSubmissionId: model.formSubmissionId,
      notes: model.notes,
      registeredDate,
      cancelledDate,
      totalAmount: model.totalAmount ?? null,
      amountPaid: model.amountPaid ?? 0,
      couponId: model.couponId ?? null,
      waitlistNotifiedDate: waitlistNotifiedDate ?? null
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("registrations").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Registration | undefined> {
    return (await getDb().selectFrom("registrations").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<Registration[]> {
    return getDb().selectFrom("registrations").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadForEvent(churchId: string, eventId: string): Promise<Registration[]> {
    return getDb().selectFrom("registrations").selectAll()
      .where("churchId", "=", churchId)
      .where("eventId", "=", eventId)
      .orderBy("registeredDate").execute();
  }

  public async loadForPerson(churchId: string, personId: string): Promise<Registration[]> {
    return getDb().selectFrom("registrations").selectAll()
      .where("churchId", "=", churchId)
      .where("personId", "=", personId)
      .orderBy("registeredDate", "desc").execute();
  }

  public async loadForHousehold(churchId: string, householdId: string): Promise<Registration[]> {
    return getDb().selectFrom("registrations").selectAll()
      .where("churchId", "=", churchId)
      .where("householdId", "=", householdId)
      .orderBy("registeredDate", "desc").execute();
  }

  // Of the given people, those already on a non-cancelled registration for the event, as registrant or attendee.
  public async loadRegisteredPersonIds(churchId: string, eventId: string, personIds: string[], excludeRegistrationId?: string): Promise<string[]> {
    if (personIds.length === 0) return [];
    let registrants = getDb().selectFrom("registrations").select("personId")
      .where("churchId", "=", churchId)
      .where("eventId", "=", eventId)
      .where("status", "<>", "cancelled")
      .where("personId", "in", personIds);
    let attendees = getDb().selectFrom("registrationMembers as m")
      .innerJoin("registrations as r", "r.id", "m.registrationId")
      .select("m.personId")
      .where("r.churchId", "=", churchId)
      .where("r.eventId", "=", eventId)
      .where("r.status", "<>", "cancelled")
      .where("m.personId", "in", personIds);
    if (excludeRegistrationId) {
      registrants = registrants.where("id", "<>", excludeRegistrationId);
      attendees = attendees.where("r.id", "<>", excludeRegistrationId);
    }
    const rows = [...await registrants.execute(), ...await attendees.execute()];
    return [...new Set(rows.map((r) => r.personId).filter((id): id is string => !!id))];
  }

  public async countActiveForEvent(churchId: string, eventId: string): Promise<number> {
    const result = await getDb().selectFrom("registrations")
      .select(sql<number>`COUNT(*)`.as("cnt"))
      .where("churchId", "=", churchId)
      .where("eventId", "=", eventId)
      .where("status", "in", ["pending", "confirmed"])
      .executeTakeFirst();
    return result?.cnt || 0;
  }

  public async countActiveForCoupon(churchId: string, couponId: string): Promise<number> {
    const result = await getDb().selectFrom("registrations")
      .select(sql<number>`COUNT(*)`.as("cnt"))
      .where("churchId", "=", churchId)
      .where("couponId", "=", couponId)
      .where("status", "in", ["pending", "confirmed"])
      .executeTakeFirst();
    return result?.cnt || 0;
  }

  public async atomicInsertWithCapacityCheck(registration: Registration, capacity: number | null): Promise<boolean> {
    const id = registration.id || UniqueIdHelper.shortId();
    const registeredDate = registration.registeredDate ? DateHelper.toMysqlDate(registration.registeredDate) : registration.registeredDate;

    const values = {
      id,
      churchId: registration.churchId,
      eventId: registration.eventId,
      personId: registration.personId || null,
      householdId: registration.householdId || null,
      status: registration.status || "confirmed",
      formSubmissionId: registration.formSubmissionId || null,
      notes: registration.notes || null,
      registeredDate: registeredDate || null,
      cancelledDate: registration.cancelledDate || null,
      totalAmount: registration.totalAmount ?? null,
      amountPaid: registration.amountPaid ?? 0,
      couponId: registration.couponId || null,
      waitlistNotifiedDate: registration.waitlistNotifiedDate || null
    };

    if (capacity === null || capacity === undefined) {
      await getDb().insertInto("registrations").values(values).execute();
      registration.id = id;
      return true;
    }

    const result: MysqlWriteResult = await sql`INSERT INTO registrations (id, churchId, eventId, personId, householdId, status, formSubmissionId, notes, registeredDate, cancelledDate, totalAmount, amountPaid, couponId, waitlistNotifiedDate)
      SELECT ${values.id}, ${values.churchId}, ${values.eventId}, ${values.personId}, ${values.householdId}, ${values.status}, ${values.formSubmissionId}, ${values.notes}, ${values.registeredDate}, ${values.cancelledDate}, ${values.totalAmount}, ${values.amountPaid}, ${values.couponId}, ${values.waitlistNotifiedDate}
      FROM dual
      WHERE (SELECT COUNT(*) FROM registrations WHERE eventId=${values.eventId} AND churchId=${values.churchId} AND status IN ('pending','confirmed')) < ${capacity}`.execute(getDb());
    if (result?.numAffectedRows > 0n || result?.affectedRows > 0) {
      registration.id = id;
      return true;
    }
    return false;
  }

  // Flips a cancelled registration back to active only while the event still has room.
  public async restoreWithCapacityCheck(churchId: string, id: string, eventId: string, status: string, capacity: number | null): Promise<boolean> {
    const cap = capacity === null || capacity === undefined ? Number.MAX_SAFE_INTEGER : capacity;
    const result: MysqlWriteResult = await sql`UPDATE registrations SET status=${status}, cancelledDate=NULL
      WHERE id=${id} AND churchId=${churchId} AND status='cancelled'
      AND (SELECT cnt FROM (SELECT COUNT(*) AS cnt FROM registrations WHERE churchId=${churchId} AND eventId=${eventId} AND status IN ('pending','confirmed')) AS used) < ${cap}`.execute(getDb());
    return result?.numAffectedRows > 0n || result?.affectedRows > 0;
  }

  // Compare-and-set so two payments or refunds recorded at once can't overwrite each other's amountPaid.
  public async updatePaidIfUnchanged(churchId: string, id: string, expected: Pick<Registration, "amountPaid" | "status">, next: Pick<Registration, "amountPaid" | "status">): Promise<boolean> {
    const result = await getDb().updateTable("registrations")
      .set({ amountPaid: next.amountPaid, status: next.status })
      .where("id", "=", id)
      .where("churchId", "=", churchId)
      .where("amountPaid", "=", Number(expected.amountPaid) || 0)
      .where("status", "=", expected.status)
      .executeTakeFirst();
    return Number(result?.numUpdatedRows ?? 0) > 0;
  }

  public async promoteFromWaitlist(churchId: string, eventId: string, capacity: number | null, registrationId?: string): Promise<Registration | null> {
    let query = getDb().selectFrom("registrations").selectAll()
      .where("churchId", "=", churchId)
      .where("eventId", "=", eventId)
      .where("status", "=", "waitlisted");
    if (registrationId) query = query.where("id", "=", registrationId);
    const candidate = await query.orderBy("registeredDate").limit(1).executeTakeFirst();
    if (!candidate) return null;

    const cap = capacity === null || capacity === undefined ? Number.MAX_SAFE_INTEGER : capacity;
    const status = Number(candidate.totalAmount || 0) - Number(candidate.amountPaid || 0) > 0 ? "pending" : "confirmed";
    const result: MysqlWriteResult = await sql`UPDATE registrations SET status=${status}, waitlistNotifiedDate=NOW()
      WHERE id=${candidate.id} AND churchId=${churchId} AND status='waitlisted'
      AND (SELECT cnt FROM (SELECT COUNT(*) AS cnt FROM registrations WHERE churchId=${churchId} AND eventId=${eventId} AND status IN ('pending','confirmed')) AS used) < ${cap}`.execute(getDb());
    if (result?.numAffectedRows > 0n || result?.affectedRows > 0) {
      return { ...candidate, status, waitlistNotifiedDate: new Date() };
    }
    return null;
  }

  public convertToModel(_churchId: string, data: Registration) { return data; }
  public convertAllToModel(_churchId: string, data: Registration[]) { return data || []; }
}
