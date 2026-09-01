import { RepoManager } from "../infrastructure/RepoManager.js";
import { KyselyPool } from "../infrastructure/KyselyPool.js";

// Gateway: the only seam through which other modules read giving data.
export interface GivingModuleGateway {
  loadDonationsByPerson(churchId: string, personId: string): Promise<any[]>;
  loadCustomersByPerson(churchId: string, personId: string): Promise<any[]>;
  loadSubscriptionsByPerson(churchId: string, personId: string): Promise<any[]>;
  // Non-sensitive descriptors only — never gateway tokens or raw payment details.
  loadPaymentMethodsByPerson(churchId: string, personId: string): Promise<any[]>;
  loadFundDonations(churchId: string, donationId: string): Promise<{ fundId: string; amount: number }[]>;
  // List-condition provider: people who donated in the window (optionally to one fund).
  loadDonorPersonIds(churchId: string, fundId: string | null, startDate: Date, endDate: Date): Promise<string[]>;
  // First-time-donor detection: total donation rows for the person (the new one included).
  loadDonationCountForPerson(churchId: string, personId: string): Promise<number>;
}

class GivingModuleGatewayDb implements GivingModuleGateway {
  private async repos() {
    return RepoManager.getRepos<any>("giving");
  }

  public async loadDonationsByPerson(churchId: string, personId: string) {
    return (await this.repos()).donation.loadByPersonId(churchId, personId);
  }

  public async loadCustomersByPerson(churchId: string, personId: string) {
    return (await this.repos()).customer.loadByPersonId(churchId, personId);
  }

  private async customerIds(churchId: string, personId: string): Promise<string[]> {
    const db = KyselyPool.getDb("giving") as any;
    const rows = await db.selectFrom("customers").select("id")
      .where("churchId", "=", churchId)
      .where("personId", "=", personId)
      .execute();
    return rows.map((r: any) => r.id);
  }

  public async loadSubscriptionsByPerson(churchId: string, personId: string) {
    const customerIds = await this.customerIds(churchId, personId);
    if (customerIds.length === 0) return [];
    const db = KyselyPool.getDb("giving") as any;
    const subscriptions = await db.selectFrom("subscriptions").selectAll()
      .where("churchId", "=", churchId)
      .where("customerId", "in", customerIds)
      .execute();
    if (subscriptions.length === 0) return [];
    const funds = await db.selectFrom("subscriptionFunds").selectAll()
      .where("churchId", "=", churchId)
      .where("subscriptionId", "in", subscriptions.map((s: any) => s.id))
      .execute();
    return subscriptions.map((s: any) => ({ ...s, funds: funds.filter((f: any) => f.subscriptionId === s.id) }));
  }

  public async loadPaymentMethodsByPerson(churchId: string, personId: string) {
    const customerIds = await this.customerIds(churchId, personId);
    if (customerIds.length === 0) return [];
    const db = KyselyPool.getDb("giving") as any;
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

  public async loadDonationCountForPerson(churchId: string, personId: string): Promise<number> {
    const db = KyselyPool.getDb("giving") as any;
    const row = await db.selectFrom("donations")
      .select((eb: any) => eb.fn.countAll().as("total"))
      .where("churchId", "=", churchId)
      .where("personId", "=", personId)
      .executeTakeFirst();
    return Number(row?.total || 0);
  }

  public async loadDonorPersonIds(churchId: string, fundId: string | null, startDate: Date, endDate: Date) {
    const repos = await this.repos();
    const rows = fundId
      ? await repos.fundDonation.loadByFundIdDate(churchId, fundId, startDate, endDate)
      : await repos.fundDonation.loadAllByDate(churchId, startDate, endDate);
    const ids = new Set<string>();
    (rows || []).forEach((r: any) => { if (r.personId) ids.add(r.personId); });
    return Array.from(ids);
  }
}

let _instance: GivingModuleGateway;
export const getGivingModuleGateway = (): GivingModuleGateway => (_instance ??= new GivingModuleGatewayDb());
