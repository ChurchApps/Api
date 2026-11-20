import { DateHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { RegistrationCoupon } from "../models/index.js";
import { injectable } from "inversify";

@injectable()
export class RegistrationCouponRepo {
  public async save(model: RegistrationCoupon) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: RegistrationCoupon): Promise<RegistrationCoupon> {
    model.id = UniqueIdHelper.shortId();
    const startDate = model.startDate ? DateHelper.toMysqlDate(model.startDate) : model.startDate;
    const endDate = model.endDate ? DateHelper.toMysqlDate(model.endDate) : model.endDate;
    await getDb().insertInto("registrationCoupons").values({
      id: model.id,
      churchId: model.churchId,
      eventId: model.eventId,
      code: model.code,
      discountType: model.discountType ?? null,
      value: model.value ?? null,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      minMembers: model.minMembers ?? null,
      maxUses: model.maxUses ?? null,
      active: model.active === false ? false : true
    }).execute();
    return model;
  }

  private async update(model: RegistrationCoupon): Promise<RegistrationCoupon> {
    const startDate = model.startDate ? DateHelper.toMysqlDate(model.startDate) : model.startDate;
    const endDate = model.endDate ? DateHelper.toMysqlDate(model.endDate) : model.endDate;
    await getDb().updateTable("registrationCoupons").set({
      code: model.code,
      discountType: model.discountType ?? null,
      value: model.value ?? null,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      minMembers: model.minMembers ?? null,
      maxUses: model.maxUses ?? null,
      active: model.active === false ? false : true
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("registrationCoupons").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<RegistrationCoupon | undefined> {
    return (await getDb().selectFrom("registrationCoupons").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadForEvent(churchId: string, eventId: string): Promise<RegistrationCoupon[]> {
    return getDb().selectFrom("registrationCoupons").selectAll()
      .where("churchId", "=", churchId)
      .where("eventId", "=", eventId).execute();
  }

  public async loadByCode(churchId: string, eventId: string, code: string): Promise<RegistrationCoupon | undefined> {
    return (await getDb().selectFrom("registrationCoupons").selectAll()
      .where("churchId", "=", churchId)
      .where("eventId", "=", eventId)
      .where(sql`LOWER(code)`, "=", (code || "").toLowerCase())
      .executeTakeFirst()) ?? null;
  }

  public convertToModel(_churchId: string, data: RegistrationCoupon) { return data; }
  public convertAllToModel(_churchId: string, data: RegistrationCoupon[]) { return data || []; }
}
