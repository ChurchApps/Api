import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DateHelper } from "../../../shared/helpers/DateHelper.js";
import { Campaign } from "../models/index.js";
import { GivingTotal } from "../helpers/CampaignHelper.js";
import type { CampaignRow } from "./types.js";

@injectable()
export class CampaignRepo {

  public async save(model: Campaign) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(campaign: Campaign): Promise<Campaign> {
    campaign.id = UniqueIdHelper.shortId();
    await getDb().insertInto("campaigns").values({
      id: campaign.id,
      churchId: campaign.churchId,
      fundId: campaign.fundId,
      name: campaign.name,
      description: campaign.description,
      goalAmount: campaign.goalAmount,
      startDate: DateHelper.toMysqlDateOnly(campaign.startDate),
      endDate: DateHelper.toMysqlDateOnly(campaign.endDate),
      showPublic: campaign.showPublic ? 1 : 0,
      allowSelfPledge: campaign.allowSelfPledge ? 1 : 0,
      removed: 0
    }).execute();
    return campaign;
  }

  private async update(campaign: Campaign): Promise<Campaign> {
    await getDb().updateTable("campaigns").set({
      fundId: campaign.fundId,
      name: campaign.name,
      description: campaign.description,
      goalAmount: campaign.goalAmount,
      startDate: DateHelper.toMysqlDateOnly(campaign.startDate),
      endDate: DateHelper.toMysqlDateOnly(campaign.endDate),
      showPublic: campaign.showPublic ? 1 : 0,
      allowSelfPledge: campaign.allowSelfPledge ? 1 : 0
    }).where("id", "=", campaign.id).where("churchId", "=", campaign.churchId).execute();
    return campaign;
  }

  public async delete(churchId: string, id: string) {
    // Soft delete
    await getDb().updateTable("campaigns").set({ removed: 1 }).where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<CampaignRow | null> {
    return (await getDb().selectFrom("campaigns").selectAll().where("id", "=", id).where("churchId", "=", churchId).where(sql.ref<number>("removed"), "=", 0).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<CampaignRow[]> {
    const rows = await getDb().selectFrom("campaigns").selectAll()
      .where("churchId", "=", churchId)
      .where(sql.ref<number>("removed"), "=", 0)
      .orderBy("startDate")
      .orderBy("name")
      .execute();
    return rows;
  }

  public async loadPublic(churchId: string): Promise<CampaignRow[]> {
    const today = DateHelper.today();
    const result = await sql<CampaignRow>`
      SELECT * FROM campaigns
      WHERE churchId = ${churchId} AND removed = 0 AND showPublic = 1
        AND (endDate IS NULL OR endDate >= ${today})
      ORDER BY startDate, name`.execute(getDb());
    return result.rows;
  }

  public async loadGivingTotals(churchId: string, campaignId?: string, personId?: string): Promise<GivingTotal[]> {
    const result = await sql<{ campaignId: string; personId: string | null; amount: number | string | null }>`
      SELECT c.id AS campaignId, d.personId, SUM(fd.amount) AS amount
      FROM campaigns c
      INNER JOIN fundDonations fd ON fd.churchId = c.churchId AND fd.fundId = c.fundId
      INNER JOIN donations d ON d.id = fd.donationId AND d.churchId = fd.churchId
      WHERE c.churchId = ${churchId} AND c.removed = 0
        AND d.donationDate >= c.startDate
        AND (c.endDate IS NULL OR d.donationDate < DATE_ADD(c.endDate, INTERVAL 1 DAY))
        AND (d.status IS NULL OR d.status = 'complete')
        ${campaignId ? sql`AND c.id = ${campaignId}` : sql``}
        ${personId ? sql`AND d.personId = ${personId}` : sql``}
      GROUP BY c.id, d.personId`.execute(getDb());
    return result.rows.map((r) => ({ campaignId: r.campaignId, personId: r.personId ?? null, amount: Number(r.amount) || 0 }));
  }

  private rowToModel(data: CampaignRow): Campaign {
    return {
      id: data.id,
      churchId: data.churchId,
      fundId: data.fundId,
      name: data.name,
      description: data.description,
      goalAmount: data.goalAmount === null || data.goalAmount === undefined ? undefined : Number(data.goalAmount),
      startDate: data.startDate,
      endDate: data.endDate,
      showPublic: !!Number(data.showPublic),
      allowSelfPledge: !!Number(data.allowSelfPledge)
    };
  }

  public convertToModel(_churchId: string, data: CampaignRow) {
    return data ? this.rowToModel(data) : null;
  }

  public convertAllToModel(_churchId: string, data: CampaignRow[]) {
    return data.map((d) => this.rowToModel(d));
  }
}
