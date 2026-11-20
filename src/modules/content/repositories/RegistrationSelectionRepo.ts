import { UniqueIdHelper } from "@churchapps/apihelper";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { RegistrationSelection } from "../models/index.js";
import { injectable } from "inversify";
import type { WithUsage } from "./types.js";

@injectable()
export class RegistrationSelectionRepo {
  public async save(model: RegistrationSelection) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: RegistrationSelection): Promise<RegistrationSelection> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("registrationSelections").values({
      id: model.id,
      churchId: model.churchId,
      eventId: model.eventId,
      name: model.name,
      description: model.description ?? null,
      price: model.price ?? null,
      capacity: model.capacity ?? null,
      maxQuantity: model.maxQuantity ?? null,
      sort: model.sort ?? null,
      active: model.active === false ? false : true
    }).execute();
    return model;
  }

  private async update(model: RegistrationSelection): Promise<RegistrationSelection> {
    await getDb().updateTable("registrationSelections").set({
      name: model.name,
      description: model.description ?? null,
      price: model.price ?? null,
      capacity: model.capacity ?? null,
      maxQuantity: model.maxQuantity ?? null,
      sort: model.sort ?? null,
      active: model.active === false ? false : true
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("registrationSelections").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<RegistrationSelection | undefined> {
    return (await getDb().selectFrom("registrationSelections").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadForEvent(churchId: string, eventId: string): Promise<RegistrationSelection[]> {
    return getDb().selectFrom("registrationSelections").selectAll()
      .where("churchId", "=", churchId)
      .where("eventId", "=", eventId)
      .orderBy("sort").execute();
  }

  // Active selections plus a derived `used` quantity (SUM over choices on active registrations).
  public async loadActiveWithUsage(churchId: string, eventId: string): Promise<WithUsage<RegistrationSelection>[]> {
    const result = await sql<WithUsage<RegistrationSelection>>`SELECT s.*, (
        SELECT COALESCE(SUM(c.quantity),0) FROM registrationSelectionChoices c JOIN registrations r ON r.id=c.registrationId
        WHERE c.selectionId=s.id AND r.status IN ('pending','confirmed')
      ) AS used
      FROM registrationSelections s
      WHERE s.churchId=${churchId} AND s.eventId=${eventId} AND s.active=1
      ORDER BY s.sort`.execute(getDb());
    return result.rows;
  }

  public convertToModel(_churchId: string, data: RegistrationSelection) { return data; }
  public convertAllToModel(_churchId: string, data: RegistrationSelection[]) { return data || []; }
}
