import { DateHelper } from "@churchapps/apihelper";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { Registration } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";
import { injectable } from "inversify";

@injectable()
export class RegistrationRepo extends ConfiguredRepo<Registration> {
  protected get repoConfig(): RepoConfig<Registration> {
    return {
      tableName: "registrations",
      hasSoftDelete: false,
      columns: [
        "eventId", "personId", "householdId", "status", "formSubmissionId",
        "notes", "registeredDate", "cancelledDate"
      ]
    };
  }

  protected async create(model: Registration): Promise<Registration> {
    const m: any = model as any;
    if (!m[this.idColumn]) m[this.idColumn] = this.createId();
    if (m.registeredDate) m.registeredDate = DateHelper.toMysqlDate(m.registeredDate);
    if (m.cancelledDate) m.cancelledDate = DateHelper.toMysqlDate(m.cancelledDate);
    const { sql, params } = this.buildInsert(model);
    await TypedDB.query(sql, params);
    return model;
  }

  protected async update(model: Registration): Promise<Registration> {
    const m: any = model as any;
    if (m.registeredDate) m.registeredDate = DateHelper.toMysqlDate(m.registeredDate);
    if (m.cancelledDate) m.cancelledDate = DateHelper.toMysqlDate(m.cancelledDate);
    const { sql, params } = this.buildUpdate(model);
    await TypedDB.query(sql, params);
    return model;
  }

  public async loadForEvent(churchId: string, eventId: string): Promise<Registration[]> {
    return TypedDB.query(
      "SELECT * FROM registrations WHERE churchId=? AND eventId=? ORDER BY registeredDate;",
      [churchId, eventId]
    );
  }

  public async loadForPerson(churchId: string, personId: string): Promise<Registration[]> {
    return TypedDB.query(
      "SELECT * FROM registrations WHERE churchId=? AND personId=? ORDER BY registeredDate DESC;",
      [churchId, personId]
    );
  }

  public async loadForHousehold(churchId: string, householdId: string): Promise<Registration[]> {
    return TypedDB.query(
      "SELECT * FROM registrations WHERE churchId=? AND householdId=? ORDER BY registeredDate DESC;",
      [churchId, householdId]
    );
  }

  public async countActiveForEvent(churchId: string, eventId: string): Promise<number> {
    const result: any = await TypedDB.queryOne(
      "SELECT COUNT(*) as cnt FROM registrations WHERE churchId=? AND eventId=? AND status IN ('pending','confirmed');",
      [churchId, eventId]
    );
    return result?.cnt || 0;
  }

  public async atomicInsertWithCapacityCheck(registration: Registration, capacity: number | null): Promise<boolean> {
    const m: any = { ...registration };
    if (!m.id) m.id = this.createId();
    if (m.registeredDate) m.registeredDate = DateHelper.toMysqlDate(m.registeredDate);

    if (capacity === null || capacity === undefined) {
      // No capacity limit — just insert
      const { sql, params } = this.buildInsert(m as Registration);
      await TypedDB.query(sql, params);
      registration.id = m.id;
      return true;
    }

    // Atomic capacity check via INSERT...SELECT
    const sql = `INSERT INTO registrations (id, churchId, eventId, personId, householdId, status, formSubmissionId, notes, registeredDate, cancelledDate)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      FROM dual
      WHERE (SELECT COUNT(*) FROM registrations WHERE eventId=? AND churchId=? AND status IN ('pending','confirmed')) < ?`;
    const params = [
      m.id, m.churchId, m.eventId, m.personId || null, m.householdId || null,
      m.status || "confirmed", m.formSubmissionId || null, m.notes || null,
      m.registeredDate || null, m.cancelledDate || null,
      m.eventId, m.churchId, capacity
    ];
    const result: any = await TypedDB.query(sql, params);
    if (result?.affectedRows > 0) {
      registration.id = m.id;
      return true;
    }
    return false;
  }
}
