import { DateHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { RegistrationPayment } from "../models/index.js";
import { injectable } from "inversify";

@injectable()
export class RegistrationPaymentRepo {
  public async save(model: RegistrationPayment) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: RegistrationPayment): Promise<RegistrationPayment> {
    model.id = UniqueIdHelper.shortId();
    const createdDate = DateHelper.toMysqlDate(model.createdDate || new Date());
    await getDb().insertInto("registrationPayments").values({
      id: model.id,
      churchId: model.churchId,
      registrationId: model.registrationId,
      gatewayId: model.gatewayId ?? null,
      provider: model.provider ?? null,
      transactionId: model.transactionId ?? null,
      method: model.method ?? null,
      amount: model.amount ?? null,
      currency: model.currency ?? null,
      kind: model.kind ?? "charge",
      status: model.status ?? null,
      personId: model.personId ?? null,
      createdDate
    }).execute();
    return model;
  }

  private async update(model: RegistrationPayment): Promise<RegistrationPayment> {
    await getDb().updateTable("registrationPayments").set({
      status: model.status ?? null,
      transactionId: model.transactionId ?? null,
      amount: model.amount ?? null
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("registrationPayments").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async loadForRegistration(churchId: string, registrationId: string): Promise<RegistrationPayment[]> {
    return getDb().selectFrom("registrationPayments").selectAll()
      .where("churchId", "=", churchId)
      .where("registrationId", "=", registrationId)
      .orderBy("createdDate").execute();
  }

  public async deleteForRegistration(churchId: string, registrationId: string): Promise<void> {
    await getDb().deleteFrom("registrationPayments")
      .where("churchId", "=", churchId)
      .where("registrationId", "=", registrationId).execute();
  }

  public convertToModel(_churchId: string, data: RegistrationPayment) { return data; }
  public convertAllToModel(_churchId: string, data: RegistrationPayment[]) { return data || []; }
}
