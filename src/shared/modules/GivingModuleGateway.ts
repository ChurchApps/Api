import { RepoManager } from "../infrastructure/RepoManager.js";

// Gateway: the only seam through which other modules read giving data.
export interface GivingModuleGateway {
  loadDonationsByPerson(churchId: string, personId: string): Promise<any[]>;
  loadCustomersByPerson(churchId: string, personId: string): Promise<any[]>;
  loadFundDonations(churchId: string, donationId: string): Promise<{ fundId: string; amount: number }[]>;
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
}

let _instance: GivingModuleGateway;
export const getGivingModuleGateway = (): GivingModuleGateway => (_instance ??= new GivingModuleGatewayDb());
