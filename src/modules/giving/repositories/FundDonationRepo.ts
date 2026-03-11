import { injectable } from "inversify";
import { eq, and, sql } from "drizzle-orm";
import { DateHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { fundDonations } from "../../../db/schema/giving.js";
import { FundDonation } from "../models/index.js";

@injectable()
export class FundDonationRepo extends DrizzleRepo<typeof fundDonations> {
  protected readonly table = fundDonations;
  protected readonly moduleName = "giving";

  public loadAllByDate(churchId: string, startDate: Date, endDate: Date) {
    return this.executeRows(sql`
      SELECT fd.*, d.donationDate, d.batchId, d.personId
      FROM fundDonations fd
      INNER JOIN donations d ON d.id = fd.donationId
      WHERE fd.churchId = ${churchId}
        AND d.donationDate BETWEEN ${DateHelper.toMysqlDate(startDate)} AND ${DateHelper.toMysqlDate(endDate)}
      ORDER BY d.donationDate DESC
    `);
  }

  public loadByDonationId(churchId: string, donationId: string) {
    return this.db.select().from(fundDonations).where(and(eq(fundDonations.churchId, churchId), eq(fundDonations.donationId, donationId)));
  }

  public loadByPersonId(churchId: string, personId: string) {
    return this.executeRows(sql`
      SELECT fd.*
      FROM donations d
      INNER JOIN fundDonations fd ON fd.churchId = d.churchId AND fd.donationId = d.id
      WHERE d.churchId = ${churchId} AND d.personId = ${personId}
      ORDER BY d.donationDate
    `);
  }

  public loadByFundId(churchId: string, fundId: string) {
    return this.executeRows(sql`
      SELECT fd.*, d.donationDate, d.batchId, d.personId
      FROM fundDonations fd
      INNER JOIN donations d ON d.id = fd.donationId
      WHERE fd.churchId = ${churchId} AND fd.fundId = ${fundId}
      ORDER BY d.donationDate DESC
    `);
  }

  public loadByFundIdDate(churchId: string, fundId: string, startDate: Date, endDate: Date) {
    return this.executeRows(sql`
      SELECT fd.*, d.donationDate, d.batchId, d.personId
      FROM fundDonations fd
      INNER JOIN donations d ON d.id = fd.donationId
      WHERE fd.churchId = ${churchId}
        AND fd.fundId = ${fundId}
        AND d.donationDate BETWEEN ${DateHelper.toMysqlDate(startDate)} AND ${DateHelper.toMysqlDate(endDate)}
      ORDER BY d.donationDate DESC
    `);
  }

  public loadByFundName(churchId: string, fundName: string) {
    return this.executeRows(sql`
      SELECT fd.*, d.donationDate, d.batchId, d.personId
      FROM fundDonations fd
      INNER JOIN donations d ON d.id = fd.donationId
      INNER JOIN funds f ON f.id = fd.fundId
      WHERE fd.churchId = ${churchId} AND f.name LIKE ${`%${fundName}%`}
      ORDER BY d.donationDate DESC
    `);
  }

  public loadByFundNameDate(churchId: string, fundName: string, startDate: Date, endDate: Date) {
    return this.executeRows(sql`
      SELECT fd.*, d.donationDate, d.batchId, d.personId
      FROM fundDonations fd
      INNER JOIN donations d ON d.id = fd.donationId
      INNER JOIN funds f ON f.id = fd.fundId
      WHERE fd.churchId = ${churchId}
        AND f.name LIKE ${`%${fundName}%`}
        AND d.donationDate BETWEEN ${DateHelper.toMysqlDate(startDate)} AND ${DateHelper.toMysqlDate(endDate)}
      ORDER BY d.donationDate DESC
    `);
  }

  public convertToModel(_churchId: string, data: any): FundDonation {
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

  public convertAllToModel(churchId: string, data: any[]) {
    return (data || []).map((d: any) => this.convertToModel(churchId, d));
  }
}
