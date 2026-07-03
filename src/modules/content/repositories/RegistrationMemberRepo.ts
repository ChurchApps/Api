import { UniqueIdHelper } from "@churchapps/apihelper";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { RegistrationMember } from "../models/index.js";
import { injectable } from "inversify";

@injectable()
export class RegistrationMemberRepo {
  public async save(model: RegistrationMember) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: RegistrationMember): Promise<RegistrationMember> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("registrationMembers").values({
      id: model.id,
      churchId: model.churchId,
      registrationId: model.registrationId,
      personId: model.personId,
      firstName: model.firstName,
      lastName: model.lastName,
      registrationTypeId: model.registrationTypeId || null
    } as any).execute();
    return model;
  }

  private async update(model: RegistrationMember): Promise<RegistrationMember> {
    await getDb().updateTable("registrationMembers").set({
      registrationId: model.registrationId,
      personId: model.personId,
      firstName: model.firstName,
      lastName: model.lastName,
      registrationTypeId: model.registrationTypeId || null
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  // Per-type capacity counted over registrationMembers joined to active registrations,
  // guarded atomically in a single INSERT...SELECT so concurrent inserts can't oversell.
  public async atomicInsertWithTypeCapacity(model: RegistrationMember, capacity: number | null): Promise<boolean> {
    if (!model.id) model.id = UniqueIdHelper.shortId();
    const typeId = model.registrationTypeId || null;

    if (capacity === null || capacity === undefined || !typeId) {
      await this.create(model);
      return true;
    }

    const result: any = await sql`INSERT INTO registrationMembers (id, churchId, registrationId, personId, firstName, lastName, registrationTypeId)
      SELECT ${model.id}, ${model.churchId}, ${model.registrationId}, ${model.personId || null}, ${model.firstName || null}, ${model.lastName || null}, ${typeId}
      FROM dual
      WHERE (SELECT COUNT(*) FROM registrationMembers m JOIN registrations r ON r.id=m.registrationId
             WHERE m.registrationTypeId=${typeId} AND r.status IN ('pending','confirmed')) < ${capacity}`.execute(getDb());
    return result?.numAffectedRows > 0n || result?.affectedRows > 0;
  }

  public async countActiveForType(churchId: string, typeId: string): Promise<number> {
    const result = await getDb().selectFrom("registrationMembers as m")
      .innerJoin("registrations as r", "r.id", "m.registrationId")
      .select(sql<number>`COUNT(*)`.as("cnt"))
      .where("m.churchId", "=", churchId)
      .where("m.registrationTypeId", "=", typeId)
      .where("r.status", "in", ["pending", "confirmed"])
      .executeTakeFirst();
    return (result as any)?.cnt || 0;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("registrationMembers").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<RegistrationMember | undefined> {
    return (await getDb().selectFrom("registrationMembers").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<RegistrationMember[]> {
    return getDb().selectFrom("registrationMembers").selectAll().where("churchId", "=", churchId).execute() as any;
  }

  public async loadForRegistration(churchId: string, registrationId: string): Promise<RegistrationMember[]> {
    return getDb().selectFrom("registrationMembers").selectAll()
      .where("churchId", "=", churchId)
      .where("registrationId", "=", registrationId).execute() as any;
  }

  public async loadForEvent(churchId: string, eventId: string): Promise<RegistrationMember[]> {
    return getDb().selectFrom("registrationMembers as rm")
      .innerJoin("registrations as r", "rm.registrationId", "r.id")
      .selectAll("rm")
      .where("r.churchId", "=", churchId)
      .where("r.eventId", "=", eventId)
      .execute() as any;
  }

  public async deleteForRegistration(churchId: string, registrationId: string): Promise<void> {
    await getDb().deleteFrom("registrationMembers")
      .where("churchId", "=", churchId)
      .where("registrationId", "=", registrationId).execute();
  }

  public convertToModel(_churchId: string, data: any) { return data as RegistrationMember; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as RegistrationMember[]; }
}
