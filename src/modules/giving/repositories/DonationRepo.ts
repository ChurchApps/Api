import { injectable } from "inversify";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import { UniqueIdHelper, DateHelper, ArrayHelper } from "@churchapps/apihelper";
import { DateHelper as LocalDateHelper } from "../../../shared/helpers/DateHelper.js";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { donations } from "../../../db/schema/giving.js";
import { Donation, DonationSummary } from "../models/index.js";
import { CollectionHelper } from "../../../shared/helpers/index.js";

/** Normalize a date-only value to midnight UTC Date for consistent storage. */
function toDateOnly(val: any): Date | null {
  if (val == null) return null;
  const str = typeof val === "string" ? val : LocalDateHelper.toMysqlDateOnly(val);
  if (!str) return null;
  return new Date(str + "T00:00:00Z");
}

@injectable()
export class DonationRepo extends DrizzleRepo<typeof donations> {
  protected readonly table = donations;
  protected readonly moduleName = "giving";

  public override async save(donation: Donation) {
    if (donation.personId === "") donation.personId = null as any;
    if (donation.id) {
      return this.update(donation);
    } else {
      return this.create(donation);
    }
  }

  private async create(donation: Donation): Promise<Donation> {
    donation.id = UniqueIdHelper.shortId();
    donation.entryTime = new Date();
    if (!donation.status) donation.status = "complete";
    const data = { ...donation } as any;
    data.donationDate = toDateOnly(donation.donationDate);
    await this.db.insert(donations).values(data);
    return donation;
  }

  private async update(donation: Donation): Promise<Donation> {
    const data = { ...donation } as any;
    data.donationDate = toDateOnly(donation.donationDate);
    const { id: _id, churchId: _churchId, ...setData } = data;
    await this.db.update(donations).set(setData)
      .where(and(eq(donations.id, donation.id!), eq(donations.churchId, donation.churchId!)));
    return donation;
  }

  public deleteByBatchId(churchId: string, batchId: string) {
    return this.db.delete(donations).where(and(eq(donations.churchId, churchId), eq(donations.batchId, batchId)));
  }

  public loadByBatchId(churchId: string, batchId: string) {
    return this.db.select().from(donations)
      .where(and(eq(donations.churchId, churchId), eq(donations.batchId, batchId)))
      .orderBy(desc(donations.entryTime));
  }

  public loadByMethodDetails(churchId: string, method: string, methodDetails: string) {
    return this.db.select().from(donations)
      .where(and(eq(donations.churchId, churchId), eq(donations.method, method), eq(donations.methodDetails, methodDetails)))
      .orderBy(desc(donations.donationDate))
      .then(r => r[0] ?? null);
  }

  public loadByPersonId(churchId: string, personId: string) {
    return this.executeRows(sql`
      SELECT d.*, f.id as fundId, IFNULL(f.name, 'Unkown') as fundName, fd.amount as fundAmount
      FROM donations d
      INNER JOIN fundDonations fd ON fd.donationId = d.id
      LEFT JOIN funds f ON f.id = fd.fundId
      WHERE d.churchId = ${churchId} AND d.personId = ${personId}
        AND (f.taxDeductible = 1 OR f.taxDeductible IS NULL)
      ORDER BY d.donationDate DESC
    `);
  }

  public async findMatchingDonation(churchId: string, amount: number, donationDate: Date, personId?: string | null): Promise<Donation | null> {
    const startOfDay = new Date(donationDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(donationDate);
    endOfDay.setHours(23, 59, 59, 999);

    const startStr = DateHelper.toMysqlDate(startOfDay);
    const endStr = DateHelper.toMysqlDate(endOfDay);

    const baseCondition = and(
      eq(donations.churchId, churchId!),
      eq(donations.amount, amount),
      sql`${donations.donationDate} >= ${startStr}`,
      sql`${donations.donationDate} <= ${endStr}`
    );

    const condition = personId
      ? and(baseCondition, eq(donations.personId, personId))
      : and(baseCondition, isNull(donations.personId));

    const rows = await this.db.select().from(donations).where(condition).limit(1);
    return rows.length > 0 ? this.convertToModel("", rows[0]) : null;
  }

  public async loadDashboardKpis(churchId: string, startDate: Date, endDate: Date, fundId?: string) {
    const sDate = DateHelper.toMysqlDate(startDate);
    const eDate = DateHelper.toMysqlDate(endDate);
    const fundFilter = fundId ? sql` AND fd.fundId = ${fundId}` : sql``;
    const rows = await this.executeRows(sql`
      SELECT SUM(fd.amount) as totalGiving, AVG(d.amount) as avgGift, COUNT(DISTINCT d.personId) as donorCount, COUNT(DISTINCT d.id) as donationCount
      FROM donations d
      INNER JOIN fundDonations fd ON fd.donationId = d.id
      INNER JOIN funds f ON f.id = fd.fundId
      WHERE d.churchId = ${churchId}
        AND d.donationDate BETWEEN ${sDate} AND ${eDate}
        ${fundFilter}
    `);
    return rows[0] ?? null;
  }

  public loadSummary(churchId: string, startDate: Date, endDate: Date) {
    const sDate = DateHelper.toMysqlDate(startDate);
    const eDate = DateHelper.toMysqlDate(endDate);
    return this.executeRows(sql`
      SELECT STR_TO_DATE(concat(year(d.donationDate), ' ', week(d.donationDate, 0), ' Sunday'), '%X %V %W') AS week,
        SUM(fd.amount) as totalAmount, f.name as fundName
      FROM donations d
      INNER JOIN fundDonations fd ON fd.donationId = d.id
      INNER JOIN funds f ON f.id = fd.fundId AND f.taxDeductible = 1
      WHERE d.churchId = ${churchId}
        AND d.donationDate BETWEEN ${sDate} AND ${eDate}
      GROUP BY year(d.donationDate), week(d.donationDate, 0), f.name
      ORDER BY year(d.donationDate), week(d.donationDate, 0), f.name
    `);
  }

  public loadPersonBasedSummary(churchId: string, startDate: Date, endDate: Date) {
    return this.executeRows(sql`
      SELECT d.personId, d.amount as donationAmount, fd.fundId, fd.amount as fundAmount, f.name as fundName
      FROM donations d
      INNER JOIN fundDonations fd ON fd.donationId = d.id
      INNER JOIN funds f ON f.id = fd.fundId AND f.taxDeductible = 1
      WHERE d.churchId = ${churchId}
        AND d.donationDate BETWEEN ${DateHelper.toMysqlDate(startDate)} AND ${DateHelper.toMysqlDate(endDate)}
    `);
  }

  public async loadByTransactionId(churchId: string, transactionId: string): Promise<Donation | null> {
    const rows = await this.db.select().from(donations)
      .where(and(eq(donations.churchId, churchId), eq(donations.transactionId, transactionId)))
      .limit(1);
    return rows.length > 0 ? this.convertToModel("", rows[0]) : null;
  }

  public async updateStatus(churchId: string, transactionId: string, status: string): Promise<void> {
    await this.db.update(donations).set({ status })
      .where(and(eq(donations.churchId, churchId), eq(donations.transactionId, transactionId)));
  }

  public convertToModel(_churchId: string, data: any): Donation {
    const result: Donation = {
      id: data.id,
      churchId: data.churchId,
      batchId: data.batchId,
      personId: data.personId,
      donationDate: data.donationDate,
      amount: data.amount,
      currency: data.currency,
      method: data.method,
      methodDetails: data.methodDetails,
      notes: data.notes,
      entryTime: data.entryTime,
      status: data.status || "complete",
      transactionId: data.transactionId
    };
    if (data.fundName !== undefined) result.fund = { id: data.fundId, name: data.fundName, amount: data.fundAmount };
    return result;
  }

  public convertAllToModel(_churchId: string, data: any) {
    return CollectionHelper.convertAll<Donation>(data, (d: any) => this.convertToModel(_churchId, d));
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
