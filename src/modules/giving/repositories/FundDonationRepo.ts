import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
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
    } as any).execute();
    return model;
  }

  private async update(model: FundDonation): Promise<FundDonation> {
    await getDb().updateTable("fundDonations").set({
      donationId: model.donationId,
      fundId: model.fundId,
      amount: model.amount
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("fundDonations").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("fundDonations").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    const rows = await getDb().selectFrom("fundDonations").selectAll()
      .where("churchId", "=", churchId)
      .execute();
    return rows;
  }

  public async loadAllByDate(churchId: string, startDate: Date, endDate: Date) {
    const result = await sql<any>`
      SELECT fd.*, d.donationDate, d.batchId, d.personId
      FROM fundDonations fd
      INNER JOIN donations d ON d.id = fd.donationId
      WHERE fd.churchId = ${churchId}
        AND d.donationDate BETWEEN ${DateHelper.toMysqlDate(startDate)} AND ${DateHelper.toMysqlDate(endDate)}
      ORDER BY d.donationDate DESC`.execute(getDb());
    return result.rows;
  }

  public async loadByDonationId(churchId: string, donationId: string) {
    const rows = await getDb().selectFrom("fundDonations").selectAll()
      .where("churchId", "=", churchId)
      .where("donationId", "=", donationId)
      .execute();
    return rows;
  }

  public async loadByPersonId(churchId: string, personId: string) {
    const result = await sql<any>`
      SELECT fd.*
      FROM donations d
      INNER JOIN fundDonations fd on fd.churchId = d.churchId and fd.donationId = d.id
      WHERE d.churchId = ${churchId} AND d.personId = ${personId}
      ORDER BY d.donationDate`.execute(getDb());
    return result.rows;
  }

  public async loadByFundId(churchId: string, fundId: string) {
    const result = await sql<any>`
      SELECT fd.*, d.donationDate, d.batchId, d.personId
      FROM fundDonations fd
      INNER JOIN donations d ON d.id = fd.donationId
      WHERE fd.churchId = ${churchId} AND fd.fundId = ${fundId}
      ORDER BY d.donationDate DESC`.execute(getDb());
    return result.rows;
  }

  public async loadByFundIdDate(churchId: string, fundId: string, startDate: Date, endDate: Date) {
    const result = await sql<any>`
      SELECT fd.*, d.donationDate, d.batchId, d.personId
      FROM fundDonations fd
      INNER JOIN donations d ON d.id = fd.donationId
      WHERE fd.churchId = ${churchId} AND fd.fundId = ${fundId}
        AND d.donationDate BETWEEN ${DateHelper.toMysqlDate(startDate)} AND ${DateHelper.toMysqlDate(endDate)}
      ORDER BY d.donationDate DESC`.execute(getDb());
    return result.rows;
  }

  public async loadByFundName(churchId: string, fundName: string) {
    const pattern = `%${fundName}%`;
    const result = await sql<any>`
      SELECT fd.*, d.donationDate, d.batchId, d.personId
      FROM fundDonations fd
      INNER JOIN donations d ON d.id = fd.donationId
      INNER JOIN funds f ON f.id = fd.fundId
      WHERE fd.churchId = ${churchId} AND f.name LIKE ${pattern}
      ORDER BY d.donationDate DESC`.execute(getDb());
    return result.rows;
  }

  public async loadByFundNameDate(churchId: string, fundName: string, startDate: Date, endDate: Date) {
    const pattern = `%${fundName}%`;
    const result = await sql<any>`
      SELECT fd.*, d.donationDate, d.batchId, d.personId
      FROM fundDonations fd
      INNER JOIN donations d ON d.id = fd.donationId
      INNER JOIN funds f ON f.id = fd.fundId
      WHERE fd.churchId = ${churchId} AND f.name LIKE ${pattern}
        AND d.donationDate BETWEEN ${DateHelper.toMysqlDate(startDate)} AND ${DateHelper.toMysqlDate(endDate)}
      ORDER BY d.donationDate DESC`.execute(getDb());
    return result.rows;
  }

  private rowToModel(data: any): FundDonation {
    const result: FundDonation = { id: data.id, donationId: data.donationId, fundId: data.fundId, amount: data.amount };
    if (data.batchId !== undefined) {
      result.donation = {
        id: result.donationId,
        donationDate: data.donationDate,
        batchId: data.batchId,
        personId: data.personId
      };
    }
    return result;
  }

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : null;
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    return data.map((d: any) => this.rowToModel(d));
  }
}
