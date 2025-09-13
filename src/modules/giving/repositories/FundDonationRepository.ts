import { injectable } from "inversify";
import { DB, ConfiguredRepository, type RepoConfig } from "../../../shared/infrastructure";
import { DateHelper } from "@churchapps/apihelper";
import { FundDonation } from "../models";

@injectable()
export class FundDonationRepository extends ConfiguredRepository<FundDonation> {
  protected get repoConfig(): RepoConfig<FundDonation> {
    return {
      tableName: "fundDonations",
      hasSoftDelete: false,
      insertColumns: ["donationId", "fundId", "amount"],
      updateColumns: ["donationId", "fundId", "amount"]
    };
  }

  public loadAllByDate(churchId: string, startDate: Date, endDate: Date) {
    return DB.query(
      "SELECT fd.*, d.donationDate, d.batchId, d.personId FROM fundDonations fd INNER JOIN donations d ON d.id=fd.donationId WHERE fd.churchId=? AND d.donationDate BETWEEN ? AND ? ORDER by d.donationDate desc;",
      [churchId, DateHelper.toMysqlDate(startDate), DateHelper.toMysqlDate(endDate)]
    );
  }

  public loadByDonationId(churchId: string, donationId: string) {
    return DB.query("SELECT * FROM fundDonations WHERE churchId=? AND donationId=?;", [churchId, donationId]);
  }

  public loadByPersonId(churchId: string, personId: string) {
    return DB.query("SELECT fd.* FROM donations d inner join fundDonations fd on fd.churchId=d.churchId and fd.donationId=d.id WHERE d.churchId=? AND d.personId=? ORDER by d.donationDate;", [
      churchId,
      personId
    ]);
  }

  public loadByFundId(churchId: string, fundId: string) {
    return DB.query(
      "SELECT fd.*, d.donationDate, d.batchId, d.personId FROM fundDonations fd INNER JOIN donations d ON d.id=fd.donationId WHERE fd.churchId=? AND fd.fundId=? ORDER by d.donationDate desc;",
      [churchId, fundId]
    );
  }

  public loadByFundIdDate(churchId: string, fundId: string, startDate: Date, endDate: Date) {
    return DB.query(
      "SELECT fd.*, d.donationDate, d.batchId, d.personId FROM fundDonations fd INNER JOIN donations d ON d.id=fd.donationId WHERE fd.churchId=? AND fd.fundId=? AND d.donationDate BETWEEN ? AND ? ORDER by d.donationDate desc;",
      [churchId, fundId, DateHelper.toMysqlDate(startDate), DateHelper.toMysqlDate(endDate)]
    );
  }

  public loadByFundName(churchId: string, fundName: string) {
    return DB.query(
      "SELECT fd.*, d.donationDate, d.batchId, d.personId FROM fundDonations fd INNER JOIN donations d ON d.id=fd.donationId INNER JOIN funds f ON f.id=fd.fundId WHERE fd.churchId=? AND f.name LIKE ? ORDER by d.donationDate desc;",
      [churchId, `%${fundName}%`]
    );
  }

  public loadByFundNameDate(churchId: string, fundName: string, startDate: Date, endDate: Date) {
    return DB.query(
      "SELECT fd.*, d.donationDate, d.batchId, d.personId FROM fundDonations fd INNER JOIN donations d ON d.id=fd.donationId INNER JOIN funds f ON f.id=fd.fundId WHERE fd.churchId=? AND f.name LIKE ? AND d.donationDate BETWEEN ? AND ? ORDER by d.donationDate desc;",
      [churchId, `%${fundName}%`, DateHelper.toMysqlDate(startDate), DateHelper.toMysqlDate(endDate)]
    );
  }

  protected rowToModel(data: any): FundDonation {
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

  // Inherit default convertToModel/convertAllToModel from BaseRepository
}
