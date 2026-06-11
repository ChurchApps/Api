import { RepoManager } from "../infrastructure/RepoManager.js";

// Gateway: the only seam through which other modules read giving data.
export interface GivingModuleGateway {
  loadDonationsByPerson(churchId: string, personId: string): Promise<any[]>;
  loadCustomersByPerson(churchId: string, personId: string): Promise<any[]>;
  loadFundDonations(churchId: string, donationId: string): Promise<{ fundId: string; amount: number }[]>;
  // List-condition provider: people who donated in the window (optionally to one fund).
  loadDonorPersonIds(churchId: string, fundId: string | null, startDate: Date, endDate: Date): Promise<string[]>;
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

  public async loadFundDonations(churchId: string, donationId: string) {
    return (await this.repos()).fundDonation.loadByDonationId(churchId, donationId);
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
