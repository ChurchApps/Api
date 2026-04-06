import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { DonationBatch } from "../models/index.js";

@injectable()
export class DonationBatchRepo {

  public async save(model: DonationBatch) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(batch: DonationBatch): Promise<DonationBatch> {
    batch.id = UniqueIdHelper.shortId();
    const batchDate = DateHelper.toMysqlDateOnly(batch.batchDate);
    await getDb().insertInto("donationBatches").values({
      id: batch.id,
      churchId: batch.churchId,
      name: batch.name,
      batchDate
    } as any).execute();
    return batch;
  }

  private async update(batch: DonationBatch): Promise<DonationBatch> {
    const batchDate = DateHelper.toMysqlDateOnly(batch.batchDate);
    await getDb().updateTable("donationBatches").set({
      name: batch.name,
      batchDate
    } as any).where("id", "=", batch.id).where("churchId", "=", batch.churchId).execute();
    return batch;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("donationBatches").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("donationBatches").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async getOrCreateCurrent(churchId: string) {
    const data = (await getDb().selectFrom("donationBatches").selectAll()
      .where("churchId", "=", churchId)
      .orderBy("batchDate", "desc")
      .limit(1)
      .executeTakeFirst()) ?? null;
    if (data) return this.convertToModel(churchId, data);
    else {
      const batch: DonationBatch = { churchId, name: "Online Donation", batchDate: new Date() };
      await this.save(batch);
      return batch;
    }
  }

  public async loadAll(churchId: string) {
    const result = await sql<any>`
      SELECT db.*,
        IFNULL(d.donationCount, 0) AS donationCount,
        IFNULL(d.totalAmount, 0) AS totalAmount
      FROM donationBatches db
      LEFT JOIN (
        SELECT batchId, COUNT(*) AS donationCount, SUM(amount) AS totalAmount
        FROM donations
        WHERE churchId = ${churchId}
        GROUP BY batchId
      ) d ON db.id = d.batchId
      WHERE db.churchId = ${churchId}
      ORDER BY db.batchDate DESC`.execute(getDb());
    return this.convertAllToModel(churchId, result.rows);
  }

  private rowToModel(data: any): DonationBatch {
    return {
      id: data.id,
      name: data.name,
      batchDate: data.batchDate,
      donationCount: data.donationCount,
      totalAmount: data.totalAmount
    };
  }

  public convertToModel(_churchId: string, data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    return data.map((d: any) => this.rowToModel(d));
  }
}
