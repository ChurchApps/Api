import { DateHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { RegistrationPayment } from "../models/index.js";
import { injectable } from "inversify";
import type { MysqlWriteResult } from "./types.js";

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

  // Inserts a pending gateway refund only when no other recent pending refund exists on the registration
  // and the refunded charge still has the amount left, so a double submit can't reach the gateway twice.
  public async reservePendingRefund(model: RegistrationPayment, chargeAmount: number, blockPendingSince: Date): Promise<boolean> {
    const id = UniqueIdHelper.shortId();
    const createdDate = DateHelper.toMysqlDate(new Date());
    const since = DateHelper.toMysqlDate(blockPendingSince);
    const result: MysqlWriteResult = await sql`INSERT INTO registrationPayments (id, churchId, registrationId, gatewayId, provider, transactionId, method, amount, currency, kind, status, personId, createdDate)
      SELECT ${id}, ${model.churchId}, ${model.registrationId}, ${model.gatewayId ?? null}, ${model.provider}, ${model.transactionId}, ${model.method ?? null}, ${model.amount}, ${model.currency ?? null}, 'refund', 'pending', ${model.personId ?? null}, ${createdDate}
      FROM dual
      WHERE NOT EXISTS (SELECT 1 FROM registrationPayments WHERE churchId=${model.churchId} AND registrationId=${model.registrationId} AND kind='refund' AND status='pending' AND createdDate > ${since})
      AND (SELECT COALESCE(SUM(amount), 0) FROM registrationPayments WHERE churchId=${model.churchId} AND registrationId=${model.registrationId} AND kind='refund' AND provider IS NOT NULL AND transactionId=${model.transactionId} AND (status IS NULL OR status <> 'failed')) + ${model.amount} <= ${chargeAmount}`.execute(getDb());
    if (result?.numAffectedRows > 0n || result?.affectedRows > 0) {
      model.id = id;
      model.kind = "refund";
      model.status = "pending";
      model.createdDate = new Date();
      return true;
    }
    return false;
  }

  public async load(churchId: string, id: string): Promise<RegistrationPayment | undefined> {
    return getDb().selectFrom("registrationPayments").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst();
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
