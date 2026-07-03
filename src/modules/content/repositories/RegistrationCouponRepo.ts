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
    const m: any = { ...model };
    if (m.startDate) m.startDate = DateHelper.toMysqlDate(m.startDate);
    if (m.endDate) m.endDate = DateHelper.toMysqlDate(m.endDate);
    await getDb().insertInto("registrationCoupons").values({
      id: model.id,
      churchId: model.churchId,
      eventId: model.eventId,
      code: model.code,
      discountType: m.discountType ?? null,
      value: m.value ?? null,
      startDate: m.startDate ?? null,
      endDate: m.endDate ?? null,
      minMembers: m.minMembers ?? null,
      maxUses: m.maxUses ?? null,
      active: model.active === false ? false : true
    } as any).execute();
    return model;
  }

  private async update(model: RegistrationCoupon): Promise<RegistrationCoupon> {
    const m: any = { ...model };
    if (m.startDate) m.startDate = DateHelper.toMysqlDate(m.startDate);
    if (m.endDate) m.endDate = DateHelper.toMysqlDate(m.endDate);
    await getDb().updateTable("registrationCoupons").set({
      code: model.code,
      discountType: m.discountType ?? null,
      value: m.value ?? null,
      startDate: m.startDate ?? null,
      endDate: m.endDate ?? null,
      minMembers: m.minMembers ?? null,
      maxUses: m.maxUses ?? null,
      active: model.active === false ? false : true
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
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
      .where("eventId", "=", eventId).execute() as any;
  }

  public async loadByCode(churchId: string, eventId: string, code: string): Promise<RegistrationCoupon | undefined> {
    return (await getDb().selectFrom("registrationCoupons").selectAll()
      .where("churchId", "=", churchId)
      .where("eventId", "=", eventId)
      .where(sql`LOWER(code)`, "=", (code || "").toLowerCase())
      .executeTakeFirst()) ?? null;
  }

  public convertToModel(_churchId: string, data: any) { return data as RegistrationCoupon; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as RegistrationCoupon[]; }
}
