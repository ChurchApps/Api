import { injectable } from "inversify";
import { eq, and, desc, sql, count, sum } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { donationBatches, donations } from "../../../db/schema/giving.js";
import { DonationBatch } from "../models/index.js";

/** Normalize a date-only value to midnight UTC Date for consistent storage. */
function toDateOnly(val: any): Date | null {
  if (val == null) return null;
  const str = typeof val === "string" ? val : DateHelper.toMysqlDateOnly(val);
  if (!str) return null;
  return new Date(str + "T00:00:00Z");
}

@injectable()
export class DonationBatchRepo extends DrizzleRepo<typeof donationBatches> {
  protected readonly table = donationBatches;
  protected readonly moduleName = "giving";

  public override async save(model: DonationBatch) {
    if (model.id) {
      await this.db.update(donationBatches).set({ name: model.name, batchDate: toDateOnly(model.batchDate) as any })
        .where(and(eq(donationBatches.id, model.id), eq(donationBatches.churchId, model.churchId!)));
    } else {
      model.id = UniqueIdHelper.shortId();
      await this.db.insert(donationBatches).values({ id: model.id, churchId: model.churchId, name: model.name, batchDate: toDateOnly(model.batchDate) as any });
    }
    return model;
  }

  public async getOrCreateCurrent(churchId: string) {
    const row = await this.db.select().from(donationBatches)
      .where(eq(donationBatches.churchId, churchId))
      .orderBy(desc(donationBatches.batchDate))
      .limit(1)
      .then(r => r[0] ?? null);

    if (row !== null) return this.convertToModel(churchId, row);
    else {
      const batch: DonationBatch = { churchId, name: "Online Donation", batchDate: new Date() };
      await this.save(batch);
      return batch;
    }
  }

  public override async loadAll(churchId: string) {
    const donationStats = this.db.select({
      batchId: donations.batchId,
      donationCount: count().as("donationCount"),
      totalAmount: sum(donations.amount).as("totalAmount")
    })
      .from(donations)
      .where(eq(donations.churchId, churchId))
      .groupBy(donations.batchId)
      .as("donationStats");

    const result = await this.db.select({
      id: donationBatches.id,
      churchId: donationBatches.churchId,
      name: donationBatches.name,
      batchDate: donationBatches.batchDate,
      donationCount: sql`COALESCE(${donationStats.donationCount}, 0)`.as("donationCount"),
      totalAmount: sql`COALESCE(${donationStats.totalAmount}, 0)`.as("totalAmount")
    })
      .from(donationBatches)
      .leftJoin(donationStats, eq(donationBatches.id, donationStats.batchId))
      .where(eq(donationBatches.churchId, churchId))
      .orderBy(desc(donationBatches.batchDate));
    return this.convertAllToModel(churchId, result);
  }

  public convertToModel(_churchId: string, data: any): DonationBatch {
    const result: DonationBatch = {
      id: data.id,
      name: data.name,
      batchDate: data.batchDate,
      donationCount: data.donationCount,
      totalAmount: data.totalAmount
    };
    return result;
  }

  public convertAllToModel(churchId: string, data: any[]) {
    return (data || []).map((d: any) => this.convertToModel(churchId, d));
  }
}
