import { injectable } from "inversify";
import { eq, and, asc, desc, sql, count, inArray } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { registrations } from "../../../db/schema/content.js";
import { Registration } from "../models/index.js";

@injectable()
export class RegistrationRepo extends DrizzleRepo<typeof registrations> {
  protected readonly table = registrations;
  protected readonly moduleName = "content";

  public async loadForEvent(churchId: string, eventId: string) {
    return this.db.select().from(registrations).where(and(eq(registrations.churchId, churchId), eq(registrations.eventId, eventId))).orderBy(asc(registrations.registeredDate));
  }

  public async loadForPerson(churchId: string, personId: string) {
    return this.db.select().from(registrations).where(and(eq(registrations.churchId, churchId), eq(registrations.personId, personId))).orderBy(desc(registrations.registeredDate));
  }

  public async loadForHousehold(churchId: string, householdId: string) {
    return this.db.select().from(registrations).where(and(eq(registrations.churchId, churchId), eq(registrations.householdId, householdId))).orderBy(desc(registrations.registeredDate));
  }

  public async countActiveForEvent(churchId: string, eventId: string): Promise<number> {
    const rows = await this.db.select({ cnt: count() })
      .from(registrations)
      .where(and(
        eq(registrations.churchId, churchId),
        eq(registrations.eventId, eventId),
        inArray(registrations.status, ["pending", "confirmed"])
      ));
    return rows[0]?.cnt || 0;
  }

  public async atomicInsertWithCapacityCheck(registration: Registration, capacity: number | null): Promise<boolean> {
    const m: any = { ...registration };
    if (!m.id) m.id = UniqueIdHelper.shortId();

    if (capacity === null || capacity === undefined) {
      await this.db.insert(registrations).values(m);
      registration.id = m.id;
      return true;
    }

    // atomicInsertWithCapacityCheck uses INSERT...SELECT which returns affectedRows, not result rows.
    // We need the raw result here, not executeRows().
    const result: any = await this.db.execute(sql`
      INSERT INTO registrations (id, churchId, eventId, personId, householdId, status, formSubmissionId, notes, registeredDate, cancelledDate)
      SELECT ${m.id}, ${m.churchId}, ${m.eventId}, ${m.personId || null}, ${m.householdId || null}, ${m.status || "confirmed"}, ${m.formSubmissionId || null}, ${m.notes || null}, ${m.registeredDate || null}, ${m.cancelledDate || null}
      FROM dual
      WHERE (SELECT COUNT(*) FROM registrations WHERE eventId = ${m.eventId} AND churchId = ${m.churchId} AND status IN ('pending','confirmed')) < ${capacity}
    `);
    const rows: any = Array.isArray(result) ? result[0] : result;
    const affectedRows = rows?.affectedRows ?? 0;
    if (affectedRows > 0) {
      registration.id = m.id;
      return true;
    }
    return false;
  }
}
