import { Campaign, Pledge } from "../models/index.js";

export type PledgeStatus = "notStarted" | "inProgress" | "fulfilled" | "beyondPledged" | "nonPledged";

export interface GivingTotal {
  campaignId?: string;
  personId: string | null;
  amount: number;
}

export interface PledgeProgressRow {
  campaignId: string;
  campaignName?: string;
  personId: string | null;
  pledgeId?: string;
  pledgedAmount: number;
  givenAmount: number;
  status: PledgeStatus;
}

export interface CampaignProgress {
  campaign: Campaign;
  totalPledged: number;
  totalGiven: number;
  pledgeCount: number;
  donorCount: number;
  rows?: PledgeProgressRow[];
}

export class CampaignHelper {
  // Amounts are doubles; compare in cents so 99.9999999 vs 100 counts as fulfilled.
  private static toCents(amount: number) {
    return Math.round((amount || 0) * 100);
  }

  static getStatus(pledgedAmount: number, givenAmount: number): PledgeStatus {
    const pledged = this.toCents(pledgedAmount);
    const given = this.toCents(givenAmount);
    if (pledged <= 0) return "nonPledged";
    if (given <= 0) return "notStarted";
    if (given < pledged) return "inProgress";
    if (given === pledged) return "fulfilled";
    return "beyondPledged";
  }

  static buildRows(campaign: Campaign, pledges: Pledge[], giving: GivingTotal[]): PledgeProgressRow[] {
    const byPerson = new Map<string | null, PledgeProgressRow>();
    pledges.forEach((p) => {
      const personId = p.personId ?? null;
      const existing = byPerson.get(personId);
      if (existing) existing.pledgedAmount += p.amount || 0;
      else byPerson.set(personId, { campaignId: campaign.id, personId, pledgeId: p.id, pledgedAmount: p.amount || 0, givenAmount: 0, status: "notStarted" });
    });
    giving.forEach((g) => {
      const personId = g.personId ?? null;
      const existing = byPerson.get(personId);
      if (existing) existing.givenAmount += g.amount || 0;
      else byPerson.set(personId, { campaignId: campaign.id, personId, pledgedAmount: 0, givenAmount: g.amount || 0, status: "nonPledged" });
    });
    const rows = Array.from(byPerson.values());
    rows.forEach((r) => { r.status = this.getStatus(r.pledgedAmount, r.givenAmount); });
    return rows;
  }

  static buildProgress(campaign: Campaign, pledges: Pledge[], giving: GivingTotal[], includeRows: boolean): CampaignProgress {
    const rows = this.buildRows(campaign, pledges, giving);
    const result: CampaignProgress = {
      campaign,
      totalPledged: rows.reduce((sum, r) => sum + r.pledgedAmount, 0),
      totalGiven: rows.reduce((sum, r) => sum + r.givenAmount, 0),
      pledgeCount: pledges.length,
      donorCount: rows.filter((r) => r.givenAmount > 0).length
    };
    if (includeRows) result.rows = rows;
    return result;
  }

  static buildPeopleRows(campaigns: Campaign[], pledges: Pledge[], giving: GivingTotal[]): PledgeProgressRow[] {
    const result: PledgeProgressRow[] = [];
    campaigns.forEach((c) => {
      const rows = this.buildRows(c, pledges.filter((p) => p.campaignId === c.id), giving.filter((g) => g.campaignId === c.id));
      rows.forEach((r) => { r.campaignName = c.name; });
      result.push(...rows);
    });
    return result;
  }
}
