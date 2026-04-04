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
      cancelledDate: m.cancelledDate
    } as any).execute();
    return model;
  }

  private async update(model: Registration): Promise<Registration> {
    const m: any = { ...model };
    if (m.registeredDate) m.registeredDate = DateHelper.toMysqlDate(m.registeredDate);
    if (m.cancelledDate) m.cancelledDate = DateHelper.toMysqlDate(m.cancelledDate);
    await getDb().updateTable("registrations").set({
      eventId: m.eventId,
      personId: m.personId,
      householdId: m.householdId,
      status: m.status,
      formSubmissionId: m.formSubmissionId,
      notes: m.notes,
      registeredDate: m.registeredDate,
      cancelledDate: m.cancelledDate
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
    const result = await sql`SELECT COUNT(*) as cnt FROM registrations WHERE churchId=${churchId} AND eventId=${eventId} AND status IN ('pending','confirmed')`.execute(getDb());
    const row: any = result.rows[0];
    return row?.cnt || 0;
  }

  public async atomicInsertWithCapacityCheck(registration: Registration, capacity: number | null): Promise<boolean> {
    const m: any = { ...registration };
    if (!m.id) m.id = UniqueIdHelper.shortId();
    if (m.registeredDate) m.registeredDate = DateHelper.toMysqlDate(m.registeredDate);

    if (capacity === null || capacity === undefined) {
      // No capacity limit — just insert
      await getDb().insertInto("registrations").values({
        id: m.id,
        churchId: m.churchId,
        eventId: m.eventId,
        personId: m.personId || null,
        householdId: m.householdId || null,
        status: m.status || "confirmed",
        formSubmissionId: m.formSubmissionId || null,
        notes: m.notes || null,
        registeredDate: m.registeredDate || null,
        cancelledDate: m.cancelledDate || null
      } as any).execute();
      registration.id = m.id;
      return true;
    }

    // Atomic capacity check via INSERT...SELECT
    const result: any = await sql`INSERT INTO registrations (id, churchId, eventId, personId, householdId, status, formSubmissionId, notes, registeredDate, cancelledDate)
      SELECT ${m.id}, ${m.churchId}, ${m.eventId}, ${m.personId || null}, ${m.householdId || null}, ${m.status || "confirmed"}, ${m.formSubmissionId || null}, ${m.notes || null}, ${m.registeredDate || null}, ${m.cancelledDate || null}
      FROM dual
      WHERE (SELECT COUNT(*) FROM registrations WHERE eventId=${m.eventId} AND churchId=${m.churchId} AND status IN ('pending','confirmed')) < ${capacity}`.execute(getDb());
    if (result?.numAffectedRows > 0n || result?.affectedRows > 0) {
      registration.id = m.id;
      return true;
    }
    return false;
  }

  public convertToModel(_churchId: string, data: any) { return data as Registration; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as Registration[]; }
}
