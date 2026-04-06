import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper, DateHelper, ArrayHelper } from "@churchapps/apihelper";
import { DateHelper as LocalDateHelper } from "../../../shared/helpers/DateHelper.js";
import { Donation, DonationSummary } from "../models/index.js";

@injectable()
export class DonationRepo {

  public async save(donation: Donation) {
    if (donation.personId === "") donation.personId = null as any;
    return donation.id ? this.update(donation) : this.create(donation);
  }

  private async create(donation: Donation): Promise<Donation> {
    donation.id = UniqueIdHelper.shortId();
    donation.entryTime = new Date();
    if (!donation.status) donation.status = "complete";
    const donationDate = LocalDateHelper.toMysqlDateOnly(donation.donationDate);
    const entryTime = DateHelper.toMysqlDate(donation.entryTime);
    await getDb().insertInto("donations").values({
      id: donation.id,
      churchId: donation.churchId,
      batchId: donation.batchId,
      personId: donation.personId,
      donationDate,
      amount: donation.amount,
      currency: donation.currency,
      method: donation.method,
      methodDetails: donation.methodDetails,
      notes: donation.notes,
      entryTime,
      status: donation.status,
      transactionId: donation.transactionId
    } as any).execute();
    return donation;
  }

  private async update(donation: Donation): Promise<Donation> {
    const donationDate = LocalDateHelper.toMysqlDateOnly(donation.donationDate);
    const entryTime = DateHelper.toMysqlDate(donation.entryTime as Date);
    await getDb().updateTable("donations").set({
      batchId: donation.batchId,
      personId: donation.personId,
      donationDate,
      amount: donation.amount,
      currency: donation.currency,
      method: donation.method,
      methodDetails: donation.methodDetails,
      notes: donation.notes,
      entryTime,
      status: donation.status,
      transactionId: donation.transactionId
    } as any).where("id", "=", donation.id).where("churchId", "=", donation.churchId).execute();
    return donation;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("donations").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("donations").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    const rows = await getDb().selectFrom("donations").selectAll()
      .where("churchId", "=", churchId)
      .orderBy("donationDate", "desc")
      .execute();
    return rows;
  }

  public async deleteByBatchId(churchId: string, batchId: string) {
    await getDb().deleteFrom("donations").where("churchId", "=", churchId).where("batchId", "=", batchId).execute();
  }

  public async loadByBatchId(churchId: string, batchId: string) {
    const rows = await getDb().selectFrom("donations").selectAll()
      .where("churchId", "=", churchId)
      .where("batchId", "=", batchId)
      .orderBy("entryTime", "desc")
      .execute();
    return rows;
  }

  public async loadByMethodDetails(churchId: string, method: string, methodDetails: string) {
    return (await getDb().selectFrom("donations").selectAll()
      .where("churchId", "=", churchId)
      .where("method", "=", method)
      .where("methodDetails", "=", methodDetails)
      .orderBy("donationDate", "desc")
      .executeTakeFirst()) ?? null;
  }

  public async loadByPersonId(churchId: string, personId: string) {
    const result = await sql<any>`
      SELECT d.*, f.id as fundId, IFNULL(f.name, 'Unkown') as fundName, fd.amount as fundAmount
      FROM donations d
      INNER JOIN fundDonations fd on fd.donationId = d.id
      LEFT JOIN funds f on f.id = fd.fundId
      WHERE d.churchId = ${churchId} AND d.personId = ${personId} AND (f.taxDeductible = 1 OR f.taxDeductible IS NULL)
      ORDER BY d.donationDate DESC`.execute(getDb());
    return result.rows;
  }

  public async findMatchingDonation(churchId: string, amount: number, donationDate: Date, personId?: string | null): Promise<Donation | null> {
    const startOfDay = new Date(donationDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(donationDate);
    endOfDay.setHours(23, 59, 59, 999);

    const startStr = DateHelper.toMysqlDate(startOfDay);
    const endStr = DateHelper.toMysqlDate(endOfDay);

    let query = getDb().selectFrom("donations").selectAll()
      .where("churchId", "=", churchId)
      .where("amount", "=", amount as any)
      .where("donationDate", ">=", startStr as any)
      .where("donationDate", "<=", endStr as any);

    if (personId) {
      query = query.where("personId", "=", personId);
    } else {
      query = query.where("personId", "is", null);
    }

    const row = (await query.limit(1).executeTakeFirst()) ?? null;
    return row ? this.rowToModel(row) : null;
  }

  public async loadDashboardKpis(churchId: string, startDate: Date, endDate: Date, fundId?: string) {
    const sDate = DateHelper.toMysqlDate(startDate);
    const eDate = DateHelper.toMysqlDate(endDate);
    if (fundId) {
      const result = await sql<any>`
        SELECT SUM(fd.amount) as totalGiving, AVG(d.amount) as avgGift, COUNT(DISTINCT d.personId) as donorCount, COUNT(DISTINCT d.id) as donationCount
        FROM donations d
        INNER JOIN fundDonations fd on fd.donationId = d.id
        INNER JOIN funds f on f.id = fd.fundId
        WHERE d.churchId = ${churchId}
          AND d.donationDate BETWEEN ${sDate} AND ${eDate}
          AND fd.fundId = ${fundId}`.execute(getDb());
      return result.rows[0] ?? null;
    } else {
      const result = await sql<any>`
        SELECT SUM(fd.amount) as totalGiving, AVG(d.amount) as avgGift, COUNT(DISTINCT d.personId) as donorCount, COUNT(DISTINCT d.id) as donationCount
        FROM donations d
        INNER JOIN fundDonations fd on fd.donationId = d.id
        INNER JOIN funds f on f.id = fd.fundId
        WHERE d.churchId = ${churchId}
          AND d.donationDate BETWEEN ${sDate} AND ${eDate}`.execute(getDb());
      return result.rows[0] ?? null;
    }
  }

  public async loadSummary(churchId: string, startDate: Date, endDate: Date) {
    const sDate = DateHelper.toMysqlDate(startDate);
    const eDate = DateHelper.toMysqlDate(endDate);
    const result = await sql<any>`
      SELECT STR_TO_DATE(concat(year(d.donationDate), ' ', week(d.donationDate, 0), ' Sunday'), '%X %V %W') AS week,
        SUM(fd.amount) as totalAmount, f.name as fundName
      FROM donations d
      INNER JOIN fundDonations fd on fd.donationId = d.id
      INNER JOIN funds f on f.id = fd.fundId AND f.taxDeductible = 1
      WHERE d.churchId = ${churchId}
        AND d.donationDate BETWEEN ${sDate} AND ${eDate}
      GROUP BY year(d.donationDate), week(d.donationDate, 0), f.name
      ORDER BY year(d.donationDate), week(d.donationDate, 0), f.name`.execute(getDb());
    return result.rows;
  }

  public async loadPersonBasedSummary(churchId: string, startDate: Date, endDate: Date) {
    const result = await sql<any>`
      SELECT d.personId, d.amount as donationAmount, fd.fundId, fd.amount as fundAmount, f.name as fundName
      FROM donations d
      INNER JOIN fundDonations fd on fd.donationId = d.id
      INNER JOIN funds f on f.id = fd.fundId AND f.taxDeductible = 1
      WHERE d.churchId = ${churchId}
        AND d.donationDate BETWEEN ${DateHelper.toMysqlDate(startDate)} AND ${DateHelper.toMysqlDate(endDate)}`.execute(getDb());
    return result.rows;
  }

  private rowToModel(row: any): Donation {
    const result: Donation = {
      id: row.id,
      churchId: row.churchId,
      batchId: row.batchId,
      personId: row.personId,
      donationDate: row.donationDate,
      amount: row.amount,
      currency: row.currency,
      method: row.method,
      methodDetails: row.methodDetails,
      notes: row.notes,
      entryTime: row.entryTime,
      status: row.status || "complete",
      transactionId: row.transactionId
    };
    if (row.fundName !== undefined) result.fund = { id: row.fundId, name: row.fundName, amount: row.fundAmount };
    return result;
  }

  public async loadByTransactionId(churchId: string, transactionId: string): Promise<Donation | null> {
    const row = (await getDb().selectFrom("donations").selectAll()
      .where("churchId", "=", churchId)
      .where("transactionId", "=", transactionId)
      .limit(1)
      .executeTakeFirst()) ?? null;
    return row ? this.rowToModel(row) : null;
  }

  public async updateStatus(churchId: string, transactionId: string, status: string): Promise<void> {
    await getDb().updateTable("donations").set({
      status
    } as any).where("churchId", "=", churchId).where("transactionId", "=", transactionId).execute();
  }

  public convertToModel(_churchId: string, data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    return data.map((d: any) => this.rowToModel(d));
  }

  public convertAllToSummary(_churchId: string, data: any[]) {
    const result: DonationSummary[] = [];
    data.forEach((d) => {
      const week = d.week;
      let weekRow: DonationSummary = ArrayHelper.getOne(result, "week", week);
      if (weekRow === null) {
        weekRow = { week, donations: [] };
        result.push(weekRow);
      }
      weekRow.donations!.push({ fund: { name: d.fundName }, totalAmount: d.totalAmount });
    });
    return result;
  }

  public convertAllToPersonSummary(_churchId: string, data: any[]) {
    const result: { personId: string; totalAmount: number; funds: { [fundName: string]: number }[] }[] = [];
    const checkDecimals = (value: number) => {
      if (value === Math.floor(value)) {
        return value;
      } else {
        return +value.toFixed(2);
      }
    };

    const peopleIds = ArrayHelper.getIds(data, "personId");
    peopleIds.forEach((id) => {
      let totalAmount: number = 0;
      const funds: any[] = [];
      const personDonations = ArrayHelper.getAll(data, "personId", id);
      personDonations.forEach((pd) => {
        totalAmount += pd.fundAmount;
      });
      const fundIds = ArrayHelper.getIds(personDonations, "fundId");
      fundIds.forEach((fuId) => {
        let totalFundAmount: number = 0;
        const fundBasedRecords = ArrayHelper.getAll(personDonations, "fundId", fuId);
        fundBasedRecords.forEach((r) => {
          totalFundAmount += r.fundAmount;
        });
        funds.push({ [fundBasedRecords[0].fundName]: checkDecimals(totalFundAmount) });
      });
      result.push({ personId: id, totalAmount: checkDecimals(totalAmount), funds });
    });

    // for anonymous donations
    const anonDonations = ArrayHelper.getAll(data, "personId", null);
    if (anonDonations.length > 0) {
      let totalAmount: number = 0;
      const funds: any[] = [];
      anonDonations.forEach((ad) => {
        totalAmount += ad.donationAmount;
      });
      const fundIds = ArrayHelper.getIds(anonDonations, "fundId");
      fundIds.forEach((fuId) => {
        let totalFundAmount: number = 0;
        const fundBasedRecords = ArrayHelper.getAll(anonDonations, "fundId", fuId);
        fundBasedRecords.forEach((r) => {
          totalFundAmount += r.fundAmount;
        });
        funds.push({ [fundBasedRecords[0].fundName]: checkDecimals(totalFundAmount) });
      });
      result.push({ personId: null as any, totalAmount: checkDecimals(totalAmount), funds });
    }

    return result;
  }
}
