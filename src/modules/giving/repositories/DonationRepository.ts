import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { UniqueIdHelper, DateHelper, ArrayHelper } from "@churchapps/apihelper";
import { Donation, DonationSummary } from "../models";

@injectable()
export class DonationRepository {
  public save(donation: Donation) {
    if (donation.personId === "") donation.personId = null as any;
    return donation.id ? this.update(donation) : this.create(donation);
  }

  private async create(donation: Donation) {
    donation.id = UniqueIdHelper.shortId();
    const donationDate = DateHelper.toMysqlDate(donation.donationDate as Date);
    const sql =
      "INSERT INTO donations (id, churchId, batchId, personId, donationDate, amount, method, methodDetails, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);";
    const params = [
      donation.id,
      donation.churchId,
      donation.batchId,
      donation.personId,
      donationDate,
      donation.amount,
      donation.method,
      donation.methodDetails,
      donation.notes
    ];
    await DB.query(sql, params);
    return donation;
  }

  private async update(donation: Donation) {
    const donationDate = DateHelper.toMysqlDate(donation.donationDate as Date);
    const sql =
      "UPDATE donations SET batchId=?, personId=?, donationDate=?, amount=?, method=?, methodDetails=?, notes=? WHERE id=? and churchId=?";
    const params = [
      donation.batchId,
      donation.personId,
      donationDate,
      donation.amount,
      donation.method,
      donation.methodDetails,
      donation.notes,
      donation.id,
      donation.churchId
    ];
    await DB.query(sql, params);
    return donation;
  }

  public delete(churchId: string, id: string) {
    return DB.query("DELETE FROM donations WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public deleteByBatchId(churchId: string, batchId: string) {
    return DB.query("DELETE FROM donations WHERE churchId=? AND batchId=?;", [churchId, batchId]);
  }

  public load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM donations WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadAll(churchId: string) {
    return DB.query("SELECT * FROM donations WHERE churchId=? ORDER BY donationDate DESC;", [churchId]);
  }

  public loadByBatchId(churchId: string, batchId: string) {
    return DB.query("SELECT d.* FROM donations d WHERE d.churchId=? AND d.batchId=? ORDER BY d.donationDate DESC;", [
      churchId,
      batchId
    ]);
  }

  public loadByMethodDetails(churchId: string, method: string, methodDetails: string) {
    return DB.queryOne(
      "SELECT d.* FROM donations d WHERE d.churchId=? AND d.method=? AND d.methodDetails=? ORDER BY d.donationDate DESC;",
      [churchId, method, methodDetails]
    );
  }

  public loadByPersonId(churchId: string, personId: string) {
    const sql =
      "SELECT d.*, f.id as fundId, IFNULL(f.name, 'Unkown') as fundName, fd.amount as fundAmount" +
      " FROM donations d" +
      " INNER JOIN fundDonations fd on fd.donationId = d.id" +
      " LEFT JOIN funds f on f.id = fd.fundId" +
      " WHERE d.churchId = ? AND d.personId = ? AND (f.taxDeductible = 1 OR f.taxDeductible IS NULL)" +
      " ORDER BY d.donationDate DESC";
    return DB.query(sql, [churchId, personId]);
  }

  public loadSummary(churchId: string, startDate: Date, endDate: Date) {
    const sDate = DateHelper.toMysqlDate(startDate);
    const eDate = DateHelper.toMysqlDate(endDate);
    // const sql = "SELECT week(d.donationDate, 0) as week, SUM(fd.amount) as totalAmount, f.name as fundName"
    const sql =
      "SELECT STR_TO_DATE(concat(year(d.donationDate), ' ', week(d.donationDate, 0), ' Sunday'), '%X %V %W') AS week, SUM(fd.amount) as totalAmount, f.name as fundName" +
      " FROM donations d" +
      " INNER JOIN fundDonations fd on fd.donationId = d.id" +
      " INNER JOIN funds f on f.id = fd.fundId AND f.taxDeductible = 1" +
      " WHERE d.churchId=?" +
      " AND d.donationDate BETWEEN ? AND ?" +
      " GROUP BY year(d.donationDate), week(d.donationDate, 0), f.name" +
      " ORDER BY year(d.donationDate), week(d.donationDate, 0), f.name";
    return DB.query(sql, [churchId, sDate, eDate]);
  }

  public loadPersonBasedSummary(churchId: string, startDate: Date, endDate: Date) {
    const sql =
      "SELECT d.personId, d.amount as donationAmount, fd.fundId, fd.amount as fundAmount, f.name as fundName" +
      " FROM donations d" +
      " INNER JOIN fundDonations fd on fd.donationId = d.id" +
      " INNER JOIN funds f on f.id = fd.fundId AND f.taxDeductible = 1" +
      " WHERE d.churchId=?" +
      " AND d.donationDate BETWEEN ? AND ?";
    return DB.query(sql, [churchId, DateHelper.toMysqlDate(startDate), DateHelper.toMysqlDate(endDate)]);
  }

  public convertToModel(churchId: string, data: any) {
    const result: Donation = {
      id: data.id,
      batchId: data.batchId,
      personId: data.personId,
      donationDate: data.donationDate,
      amount: data.amount,
      method: data.method,
      methodDetails: data.methodDetails,
      notes: data.notes
    };
    if (data.fundName !== undefined) result.fund = { id: data.fundId, name: data.fundName, amount: data.fundAmount };
    return result;
  }

  public convertAllToModel(churchId: string, data: any[]) {
    const result: Donation[] = [];
    data.forEach((d) => result.push(this.convertToModel(churchId, d)));
    return result;
  }

  public convertAllToSummary(churchId: string, data: any[]) {
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

  public convertAllToPersonSummary(churchId: string, data: any[]) {
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
      const personDonations = ArrayHelper.getAll(data, "personId", id); // combine all the donations for a person
      personDonations.forEach((pd) => {
        totalAmount += pd.fundAmount; // pd.donationAmount; // get total donated amount for a person
      });
      const fundIds = ArrayHelper.getIds(personDonations, "fundId");
      fundIds.forEach((fuId) => {
        let totalFundAmount: number = 0;
        const fundBasedRecords = ArrayHelper.getAll(personDonations, "fundId", fuId); // combine all the person donations based on fundId
        fundBasedRecords.forEach((r) => {
          totalFundAmount += r.fundAmount; // get total amount donated to each fund
        });
        funds.push({ [fundBasedRecords[0].fundName]: checkDecimals(totalFundAmount) }); // create object for each fund and the amount donated by a person
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
