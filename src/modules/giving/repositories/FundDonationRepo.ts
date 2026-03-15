import { injectable } from "inversify";
import { eq, and, between, like, desc, asc } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { fundDonations, donations, funds } from "../../../db/schema/giving.js";
import { FundDonation } from "../models/index.js";

@injectable()
export class FundDonationRepo extends DrizzleRepo<typeof fundDonations> {
  protected readonly table = fundDonations;
  protected readonly moduleName = "giving";

  public loadAllByDate(churchId: string, startDate: Date, endDate: Date) {
    return this.db.select({
      id: fundDonations.id,
      churchId: fundDonations.churchId,
      donationId: fundDonations.donationId,
      fundId: fundDonations.fundId,
      amount: fundDonations.amount,
      donationDate: donations.donationDate,
      batchId: donations.batchId,
      personId: donations.personId
    })
      .from(fundDonations)
      .innerJoin(donations, eq(donations.id, fundDonations.donationId))
      .where(and(eq(fundDonations.churchId, churchId), between(donations.donationDate, startDate, endDate)))
      .orderBy(desc(donations.donationDate));
  }

  public loadByDonationId(churchId: string, donationId: string) {
    return this.db.select().from(fundDonations).where(and(eq(fundDonations.churchId, churchId), eq(fundDonations.donationId, donationId)));
  }

  public loadByPersonId(churchId: string, personId: string) {
    return this.db.select({
      id: fundDonations.id,
      churchId: fundDonations.churchId,
      donationId: fundDonations.donationId,
      fundId: fundDonations.fundId,
      amount: fundDonations.amount
    })
      .from(donations)
      .innerJoin(fundDonations, and(eq(fundDonations.churchId, donations.churchId), eq(fundDonations.donationId, donations.id)))
      .where(and(eq(donations.churchId, churchId), eq(donations.personId, personId)))
      .orderBy(asc(donations.donationDate));
  }

  public loadByFundId(churchId: string, fundId: string) {
    return this.db.select({
      id: fundDonations.id,
      churchId: fundDonations.churchId,
      donationId: fundDonations.donationId,
      fundId: fundDonations.fundId,
      amount: fundDonations.amount,
      donationDate: donations.donationDate,
      batchId: donations.batchId,
      personId: donations.personId
    })
      .from(fundDonations)
      .innerJoin(donations, eq(donations.id, fundDonations.donationId))
      .where(and(eq(fundDonations.churchId, churchId), eq(fundDonations.fundId, fundId)))
      .orderBy(desc(donations.donationDate));
  }

  public loadByFundIdDate(churchId: string, fundId: string, startDate: Date, endDate: Date) {
    return this.db.select({
      id: fundDonations.id,
      churchId: fundDonations.churchId,
      donationId: fundDonations.donationId,
      fundId: fundDonations.fundId,
      amount: fundDonations.amount,
      donationDate: donations.donationDate,
      batchId: donations.batchId,
      personId: donations.personId
    })
      .from(fundDonations)
      .innerJoin(donations, eq(donations.id, fundDonations.donationId))
      .where(and(eq(fundDonations.churchId, churchId), eq(fundDonations.fundId, fundId), between(donations.donationDate, startDate, endDate)))
      .orderBy(desc(donations.donationDate));
  }

  public loadByFundName(churchId: string, fundName: string) {
    return this.db.select({
      id: fundDonations.id,
      churchId: fundDonations.churchId,
      donationId: fundDonations.donationId,
      fundId: fundDonations.fundId,
      amount: fundDonations.amount,
      donationDate: donations.donationDate,
      batchId: donations.batchId,
      personId: donations.personId
    })
      .from(fundDonations)
      .innerJoin(donations, eq(donations.id, fundDonations.donationId))
      .innerJoin(funds, eq(funds.id, fundDonations.fundId))
      .where(and(eq(fundDonations.churchId, churchId), like(funds.name, `%${fundName}%`)))
      .orderBy(desc(donations.donationDate));
  }

  public loadByFundNameDate(churchId: string, fundName: string, startDate: Date, endDate: Date) {
    return this.db.select({
      id: fundDonations.id,
      churchId: fundDonations.churchId,
      donationId: fundDonations.donationId,
      fundId: fundDonations.fundId,
      amount: fundDonations.amount,
      donationDate: donations.donationDate,
      batchId: donations.batchId,
      personId: donations.personId
    })
      .from(fundDonations)
      .innerJoin(donations, eq(donations.id, fundDonations.donationId))
      .innerJoin(funds, eq(funds.id, fundDonations.fundId))
      .where(and(eq(fundDonations.churchId, churchId), like(funds.name, `%${fundName}%`), between(donations.donationDate, startDate, endDate)))
      .orderBy(desc(donations.donationDate));
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
