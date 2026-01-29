import { injectable } from "inversify";
import { ConfiguredRepo, type RepoConfig } from "../../../shared/infrastructure/index.js";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { DonationBatch } from "../models/index.js";

@injectable()
export class DonationBatchRepo extends ConfiguredRepo<DonationBatch> {
  protected get repoConfig(): RepoConfig<DonationBatch> {
    return {
      tableName: "donationBatches",
      hasSoftDelete: false,
      defaultOrderBy: "batchDate DESC",
      columns: ["name", "batchDate"]
    };
  }

  public async getOrCreateCurrent(churchId: string) {
    const data = await TypedDB.queryOne("SELECT * FROM donationBatches WHERE churchId=? ORDER by batchDate DESC LIMIT 1;", [churchId]);
    if (data !== null) return this.convertToModel(churchId, data);
    else {
      const batch: DonationBatch = { churchId, name: "Online Donation", batchDate: new Date() };
      await this.save(batch);
      return batch;
    }
  }

  protected async create(batch: DonationBatch): Promise<DonationBatch> {
    const m: any = batch;
    if (!m.id) m.id = this.createId();
    const batchDate = DateHelper.toMysqlDateOnly(batch.batchDate);  // date-only field
    const sql = "INSERT INTO donationBatches (id, churchId, name, batchDate) VALUES (?, ?, ?, ?);";
    const params = [batch.id, batch.churchId, batch.name, batchDate];
    await TypedDB.query(sql, params);
    return batch;
  }

  protected async update(batch: DonationBatch): Promise<DonationBatch> {
    const batchDate = DateHelper.toMysqlDateOnly(batch.batchDate);  // date-only field
    const sql = "UPDATE donationBatches SET name=?, batchDate=? WHERE id=? and churchId=?";
    const params = [batch.name, batchDate, batch.id, batch.churchId];
    await TypedDB.query(sql, params);
    return batch;
  }

  public async loadAll(churchId: string) {
    const sql =
      "SELECT db.*, " +
      "IFNULL(d.donationCount, 0) AS donationCount, " +
      "IFNULL(d.totalAmount, 0) AS totalAmount " +
      "FROM donationBatches db " +
      "LEFT JOIN (" +
      "  SELECT batchId, COUNT(*) AS donationCount, SUM(amount) AS totalAmount " +
      "  FROM donations " +
      "  WHERE churchId = ? " +
      "  GROUP BY batchId" +
      ") d ON db.id = d.batchId " +
      "WHERE db.churchId = ? " +
      "ORDER BY db.batchDate DESC";
    const result = await TypedDB.query(sql, [churchId, churchId]);
    return this.convertAllToModel(churchId, result);
  }

  protected rowToModel(data: any): DonationBatch {
    const result: DonationBatch = {
      id: data.id,
      name: data.name,
      batchDate: data.batchDate,
      donationCount: data.donationCount,
      totalAmount: data.totalAmount
    };
    return result;
  }
}
