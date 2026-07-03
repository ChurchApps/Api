import { UniqueIdHelper } from "@churchapps/apihelper";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { RegistrationType } from "../models/index.js";
import { injectable } from "inversify";

@injectable()
export class RegistrationTypeRepo {
  public async save(model: RegistrationType) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: RegistrationType): Promise<RegistrationType> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("registrationTypes").values({
      id: model.id,
      churchId: model.churchId,
      eventId: model.eventId,
      name: model.name,
      description: model.description ?? null,
      price: model.price ?? null,
      capacity: model.capacity ?? null,
      minAgeYears: model.minAgeYears ?? null,
      maxAgeYears: model.maxAgeYears ?? null,
      formId: model.formId ?? null,
      sort: model.sort ?? null,
      active: model.active === false ? false : true
    } as any).execute();
    return model;
  }

  private async update(model: RegistrationType): Promise<RegistrationType> {
    await getDb().updateTable("registrationTypes").set({
      name: model.name,
      description: model.description ?? null,
      price: model.price ?? null,
      capacity: model.capacity ?? null,
      minAgeYears: model.minAgeYears ?? null,
      maxAgeYears: model.maxAgeYears ?? null,
      formId: model.formId ?? null,
      sort: model.sort ?? null,
      active: model.active === false ? false : true
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("registrationTypes").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<RegistrationType | undefined> {
    return (await getDb().selectFrom("registrationTypes").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadForEvent(churchId: string, eventId: string): Promise<RegistrationType[]> {
    return getDb().selectFrom("registrationTypes").selectAll()
      .where("churchId", "=", churchId)
      .where("eventId", "=", eventId)
      .orderBy("sort").execute() as any;
  }

  // Active types plus a derived `used` count (members of that type on active registrations).
  public async loadActiveWithUsage(churchId: string, eventId: string): Promise<any[]> {
    const result: any = await sql`SELECT t.*, (
        SELECT COUNT(*) FROM registrationMembers m JOIN registrations r ON r.id=m.registrationId
        WHERE m.registrationTypeId=t.id AND r.status IN ('pending','confirmed')
      ) AS used
      FROM registrationTypes t
      WHERE t.churchId=${churchId} AND t.eventId=${eventId} AND t.active=1
      ORDER BY t.sort`.execute(getDb());
    return result.rows;
  }

  public convertToModel(_churchId: string, data: any) { return data as RegistrationType; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as RegistrationType[]; }
}
