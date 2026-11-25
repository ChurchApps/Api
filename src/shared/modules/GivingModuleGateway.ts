import { RepoManager } from "../infrastructure/RepoManager.js";
import { DynamicDatabase, KyselyPool } from "../infrastructure/KyselyPool.js";
import { DonationDateRow, LapsedGiverMatch, LapsedGiverRule } from "../../modules/giving/helpers/LapsedGiverMatch.js";
import { ReceiptHelper } from "../../modules/giving/helpers/ReceiptHelper.js";
import type { Repos as GivingRepos } from "../../modules/giving/repositories/index.js";
import type { GivingDatabase } from "../../modules/giving/db/DatabaseTypes.js";
import type { Customer, Donation, FundDonation, GatewayPaymentMethod, Subscription, SubscriptionFund } from "../../modules/giving/models/index.js";

export type SubscriptionWithFunds = Subscription & { funds: SubscriptionFund[] };
export type PaymentMethodSummary = Pick<GatewayPaymentMethod, "id" | "churchId" | "gatewayId" | "customerId" | "methodType" | "displayName" | "createdAt" | "updatedAt">;

export interface DonationReceiptSummary {
  amount: number;
  currency?: string;
  donationDate?: string | Date;
  method?: string;
  funds: { name: string; amount: number }[];
}

// Gateway: the only seam through which other modules read giving data.
export interface GivingModuleGateway {
  loadDonationsByPerson(churchId: string, personId: string): Promise<Donation[]>;
  loadCustomersByPerson(churchId: string, personId: string): Promise<Customer | null>;
  loadSubscriptionsByPerson(churchId: string, personId: string): Promise<SubscriptionWithFunds[]>;
  // Non-sensitive descriptors only — never gateway tokens or raw payment details.
  loadPaymentMethodsByPerson(churchId: string, personId: string): Promise<PaymentMethodSummary[]>;
  loadFundDonations(churchId: string, donationId: string): Promise<{ fundId?: string; amount?: number }[]>;
  // One gift with its fund names, for the workflow gift merge fields.
  loadDonationSummary(churchId: string, donationId: string): Promise<DonationReceiptSummary | null>;
  // The same fund/amount table the online giving receipt email shows.
  buildReceiptHtml(summary: DonationReceiptSummary): string;
  // List-condition provider: people who donated in the window (optionally to one fund).
  loadDonorPersonIds(churchId: string, fundId: string | null, startDate: Date, endDate: Date): Promise<string[]>;
  // First-time-donor detection: total donation rows for the person (the new one included).
  loadDonationCountForPerson(churchId: string, personId: string): Promise<number>;
  // Workflow "lapsed regular giver" rule: person ids only, never amounts. anchorDate is the church-local YYYY-MM-DD.
  loadLapsedRegularGiverIds(churchId: string, anchorDate: string, rule: Partial<LapsedGiverRule>): Promise<string[]>;
  // Command palette catalog: fund names only, never donation rows.
  loadPalette(churchId: string): Promise<{ id: string; name: string }[]>;
}

class GivingModuleGatewayDb implements GivingModuleGateway {
  private async repos() {
    return RepoManager.getRepos<GivingRepos>("giving");
  }

  public async loadDonationsByPerson(churchId: string, personId: string) {
    return (await this.repos()).donation.loadByPersonId(churchId, personId);
  }

  public async loadCustomersByPerson(churchId: string, personId: string) {
    return (await this.repos()).customer.loadByPersonId(churchId, personId);
  }

  private async customerIds(churchId: string, personId: string): Promise<string[]> {
    const db = KyselyPool.getDb<GivingDatabase>("giving");
    const rows = await db.selectFrom("customers").select("id")
      .where("churchId", "=", churchId)
      .where("personId", "=", personId)
      .execute();
    return rows.map((r) => r.id);
  }

  public async loadSubscriptionsByPerson(churchId: string, personId: string) {
    const customerIds = await this.customerIds(churchId, personId);
    if (customerIds.length === 0) return [];
    const db = KyselyPool.getDb<GivingDatabase>("giving");
    const subscriptions = await db.selectFrom("subscriptions").selectAll()
      .where("churchId", "=", churchId)
      .where("customerId", "in", customerIds)
      .execute();
    if (subscriptions.length === 0) return [];
    const funds = await db.selectFrom("subscriptionFunds").selectAll()
      .where("churchId", "=", churchId)
      .where("subscriptionId", "in", subscriptions.map((s) => s.id))
      .execute();
    return subscriptions.map((s) => ({ ...s, funds: funds.filter((f) => f.subscriptionId === s.id) }));
  }

  public async loadPaymentMethodsByPerson(churchId: string, personId: string) {
    const customerIds = await this.customerIds(churchId, personId);
    if (customerIds.length === 0) return [];
    const db = KyselyPool.getDb<GivingDatabase>("giving");
    return db.selectFrom("gatewayPaymentMethods")
      .select([
        "id", "churchId", "gatewayId", "customerId", "methodType", "displayName", "createdAt", "updatedAt"
      ])
      .where("churchId", "=", churchId)
      .where("customerId", "in", customerIds)
      .execute();
  }

  public async loadFundDonations(churchId: string, donationId: string) {
    return (await this.repos()).fundDonation.loadByDonationId(churchId, donationId);
  }

  public async loadDonationSummary(churchId: string, donationId: string): Promise<DonationReceiptSummary | null> {
    const repos = await this.repos();
    const donation = await repos.donation.load(churchId, donationId);
    if (!donation) return null;
    const rows: FundDonation[] = await repos.fundDonation.loadByDonationId(churchId, donationId);
    const funds = await Promise.all(rows.map(async (r) => ({ name: (await repos.fund.load(churchId, r.fundId))?.name || "", amount: Number(r.amount || 0) })));
    return { amount: Number(donation.amount || 0), currency: donation.currency, donationDate: donation.donationDate, method: donation.method, funds };
  }

  public buildReceiptHtml(summary: DonationReceiptSummary): string {
    return ReceiptHelper.oneTimeTable(summary.funds, summary.amount, summary.currency || "USD");
  }

  public async loadDonationCountForPerson(churchId: string, personId: string): Promise<number> {
    const db = KyselyPool.getDb<GivingDatabase>("giving");
    const row = await db.selectFrom("donations")
      .select((eb) => eb.fn.countAll().as("total"))
      .where("churchId", "=", churchId)
      .where("personId", "=", personId)
      .executeTakeFirst();
    return Number(row?.total || 0);
  }

  public async loadLapsedRegularGiverIds(churchId: string, anchorDate: string, requested: Partial<LapsedGiverRule>): Promise<string[]> {
    const rule = LapsedGiverMatch.parseRule(requested);
    const { regularStart } = LapsedGiverMatch.windows(anchorDate, rule);
    // donationDate is compared against a YYYY-MM-DD string, which the typed schema (Date) does not allow.
    const db = KyselyPool.getDb<DynamicDatabase>("giving");
    const rows = await db.selectFrom("donations")
      .select(["personId", "donationDate"])
      .where("churchId", "=", churchId)
      .where("personId", "is not", null)
      .where("personId", "!=", "")
      .where("donationDate", ">=", regularStart)
      .where((eb) => eb.or([eb("status", "is", null), eb("status", "=", "complete")]))
      .execute();
    return LapsedGiverMatch.match(rows as DonationDateRow[], anchorDate, rule);
  }

  public async loadDonorPersonIds(churchId: string, fundId: string | null, startDate: Date, endDate: Date) {
    const repos = await this.repos();
    const rows = fundId
      ? await repos.fundDonation.loadByFundIdDate(churchId, fundId, startDate, endDate)
      : await repos.fundDonation.loadAllByDate(churchId, startDate, endDate);
    const ids = new Set<string>();
    (rows || []).forEach((r: { personId?: string }) => { if (r.personId) ids.add(r.personId); });
    return Array.from(ids);
  }

  public async loadPalette(churchId: string) {
    // funds.removed is a column the Fund model does not carry.
    const db = KyselyPool.getDb<DynamicDatabase>("giving");
    return db.selectFrom("funds").select(["id", "name"])
      .where("churchId", "=", churchId)
      .where("removed", "=", false)
      .orderBy("name")
      .execute() as Promise<{ id: string; name: string }[]>;
  }
}

let _instance: GivingModuleGateway;
export const getGivingModuleGateway = (): GivingModuleGateway => (_instance ??= new GivingModuleGatewayDb());
