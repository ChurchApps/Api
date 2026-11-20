import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import type { FundDonationRow } from "./types.js";
import { UniqueIdHelper, DateHelper } from "@churchapps/apihelper";
import { FundDonation } from "../models/index.js";

@injectable()
export class FundDonationRepo {

  public async save(model: FundDonation) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: FundDonation): Promise<FundDonation> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("fundDonations").values({
      id: model.id,
      churchId: model.churchId,
      donationId: model.donationId,
      fundId: model.fundId,
      amount: model.amount
    }).execute();
    return model;
  }

  private async update(model: FundDonation): Promise<FundDonation> {
    await getDb().updateTable("fundDonations").set({
      donationId: model.donationId,
      fundId: model.fundId,
      amount: model.amount
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("fundDonations").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<FundDonationRow | null> {
    const result = await sql<FundDonationRow>`
    SELECT fd.*, d.currency
    FROM fundDonations fd
    INNER JOIN donations d ON d.id = fd.donationId AND d.churchId = fd.churchId
    WHERE fd.id = ${id} AND fd.churchId = ${churchId}
    `.execute(getDb());
    return result.rows[0] ?? null;
  }

  public async loadAll(churchId: string): Promise<FundDonationRow[]> {
    const result = await sql<FundDonationRow>`
      SELECT fd.*, d.currency
      FROM fundDonations fd
      INNER JOIN donations d ON d.id = fd.donationId AND d.churchId = fd.churchId
      WHERE fd.churchId = ${churchId}`.execute(getDb());
    return result.rows;
  }

  public async loadAllByDate(churchId: string, startDate: Date, endDate: Date): Promise<FundDonationRow[]> {
    const result = await sql<FundDonationRow>`
      SELECT fd.*, d.donationDate, d.batchId, d.personId, d.currency
      FROM fundDonations fd
      INNER JOIN donations d ON d.id = fd.donationId AND d.churchId = fd.churchId
      WHERE fd.churchId = ${churchId}
        AND d.donationDate BETWEEN ${DateHelper.toMysqlDate(startDate)} AND ${DateHelper.toMysqlDate(endDate)}
      ORDER BY d.donationDate DESC`.execute(getDb());
    return result.rows;
  }

  public async loadByDonationId(churchId: string, donationId: string): Promise<FundDonationRow[]> {
    const result = await sql<FundDonationRow>`
      SELECT fd.*, d.currency
      FROM fundDonations fd
      INNER JOIN donations d ON d.id = fd.donationId AND d.churchId = fd.churchId
      WHERE fd.churchId = ${churchId} AND fd.donationId = ${donationId}
      `.execute(getDb());
    return result.rows;
  }

  public async loadByPersonId(churchId: string, personId: string): Promise<FundDonationRow[]> {
    const result = await sql<FundDonationRow>`
      SELECT fd.*, d.currency
      FROM fundDonations fd
      INNER JOIN donations d ON d.id = fd.donationId AND d.churchId = fd.churchId
      WHERE fd.churchId = ${churchId} AND d.personId = ${personId}
      ORDER BY d.donationDate`.execute(getDb());
    return result.rows;
  }

  public async loadByFundId(churchId: string, fundId: string): Promise<FundDonationRow[]> {
    const result = await sql<FundDonationRow>`
      SELECT fd.*, d.donationDate, d.batchId, d.personId, d.currency
      FROM fundDonations fd
      INNER JOIN donations d ON d.id = fd.donationId AND d.churchId = fd.churchId
      WHERE fd.churchId = ${churchId} AND fd.fundId = ${fundId}
      ORDER BY d.donationDate DESC`.execute(getDb());
    return result.rows;
  }

  public async loadByFundIdDate(churchId: string, fundId: string, startDate: Date, endDate: Date): Promise<FundDonationRow[]> {
    const result = await sql<FundDonationRow>`
      SELECT fd.*, d.donationDate, d.batchId, d.personId, d.currency
      FROM fundDonations fd
      INNER JOIN donations d ON d.id = fd.donationId AND d.churchId = fd.churchId
      WHERE fd.churchId = ${churchId} AND fd.fundId = ${fundId}
        AND d.donationDate BETWEEN ${DateHelper.toMysqlDate(startDate)} AND ${DateHelper.toMysqlDate(endDate)}
      ORDER BY d.donationDate DESC`.execute(getDb());
    return result.rows;
  }

  // Fund total grouped by gift currency (one row per currency) so the controller can convert without reading every gift.
  public async loadFundTotalsByCurrency(churchId: string, fundId: string, startDate?: Date, endDate?: Date) {
    const dateFilter = startDate && endDate ? sql`AND d.donationDate BETWEEN ${DateHelper.toMysqlDate(startDate)} AND ${DateHelper.toMysqlDate(endDate)}` : sql``;
    const result = await sql<{ currency: string | null; amount: number | string | null }>`
      SELECT d.currency AS currency, SUM(fd.amount) AS amount
      FROM fundDonations fd
      INNER JOIN donations d ON d.id = fd.donationId AND d.churchId = fd.churchId
      WHERE fd.churchId = ${churchId} AND fd.fundId = ${fundId}
        AND (d.status IS NULL OR d.status = 'complete')
        ${dateFilter}
      GROUP BY d.currency`.execute(getDb());
    return result.rows.map((r) => ({ currency: r.currency, amount: Number(r.amount) }));
  }

  public async loadByFundName(churchId: string, fundName: string): Promise<FundDonationRow[]> {
    const pattern = `%${fundName}%`;
    const result = await sql<FundDonationRow>`
      SELECT fd.*, d.donationDate, d.batchId, d.personId, d.currency
      FROM fundDonations fd
      INNER JOIN donations d ON d.id = fd.donationId AND d.churchId = fd.churchId
      INNER JOIN funds f ON f.id = fd.fundId
      WHERE fd.churchId = ${churchId} AND f.name LIKE ${pattern}
      ORDER BY d.donationDate DESC`.execute(getDb());
    return result.rows;
  }

  public async loadByFundNameDate(churchId: string, fundName: string, startDate: Date, endDate: Date): Promise<FundDonationRow[]> {
    const pattern = `%${fundName}%`;
    const result = await sql<FundDonationRow>`
      SELECT fd.*, d.donationDate, d.batchId, d.personId, d.currency
      FROM fundDonations fd
      INNER JOIN donations d ON d.id = fd.donationId AND d.churchId = fd.churchId
      INNER JOIN funds f ON f.id = fd.fundId
      WHERE fd.churchId = ${churchId} AND f.name LIKE ${pattern}
        AND d.donationDate BETWEEN ${DateHelper.toMysqlDate(startDate)} AND ${DateHelper.toMysqlDate(endDate)}
      ORDER BY d.donationDate DESC`.execute(getDb());
    return result.rows;
  }

  public async getTotalByFundId(churchId: string, fundId: string, startDate?: Date, endDate?: Date) {
    let query = getDb().selectFrom("fundDonations as fd")
      .innerJoin("donations as d", (join) => join.onRef("d.id", "=", "fd.donationId").onRef("d.churchId", "=", "fd.churchId"))
      .where("fd.churchId", "=", churchId)
      .where("fd.fundId", "=", fundId)
      .where((eb) => eb.or([eb("d.status", "is", null), eb("d.status", "=", "complete")]))
      .select((eb) => [
        eb.fn.sum("fd.amount").as("totalAmount"),
        eb.fn.count("fd.donationId").distinct().as("donationCount")
      ]);
    if (startDate) query = query.where("d.donationDate", ">=", startDate);
    if (endDate) query = query.where("d.donationDate", "<=", endDate);
    const row = await query.executeTakeFirst();
    return { totalAmount: Number(row?.totalAmount) || 0, donationCount: Number(row?.donationCount) || 0 };
  }

  private rowToModel(data: FundDonationRow): FundDonation {
    const result: FundDonationRow = { id: data.id, donationId: data.donationId, fundId: data.fundId, amount: data.amount, currency: data?.currency };
    if (data.batchId !== undefined) {
      result.donation = {
        id: result.donationId,
        donationDate: data.donationDate,
        batchId: data.batchId,
        personId: data.personId,
        currency: data.currency
      };
    }
    return result;
  }

  // FundDonationController.save passes the whole saved array here; it is read as a single row, as before.
  public convertToModel(_churchId: string, data: FundDonationRow | FundDonationRow[]) {
    return data ? this.rowToModel(data as FundDonationRow) : null;
  }

  public convertAllToModel(_churchId: string, data: FundDonationRow[]) {
    return data.map((d) => this.rowToModel(d));
  }
}
