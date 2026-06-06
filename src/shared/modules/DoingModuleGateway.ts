import { RepoManager } from "../infrastructure/RepoManager.js";

// Gateway: the only seam through which other modules read doing data.
export interface DoingModuleGateway {
  loadAssignmentsByPerson(churchId: string, personId: string): Promise<any[]>;
  loadBlockoutDatesByPerson(churchId: string, personId: string): Promise<any[]>;
  loadUnconfirmedAssignments(): Promise<any[]>;
  loadPosition(churchId: string, positionId: string): Promise<any | null>;
  loadPlan(churchId: string, planId: string): Promise<{ ministryId?: string } | null>;
  loadPlanType(churchId: string, planTypeId: string): Promise<{ ministryId?: string } | null>;
}

class DoingModuleGatewayDb implements DoingModuleGateway {
  private async repos() {
    return RepoManager.getRepos<any>("doing");
  }

  public async loadAssignmentsByPerson(churchId: string, personId: string) {
    return (await this.repos()).assignment.loadByByPersonId(churchId, personId);
  }

  public async loadBlockoutDatesByPerson(churchId: string, personId: string) {
    return (await this.repos()).blockoutDate.loadForPerson(churchId, personId);
  }

  public async loadUnconfirmedAssignments() {
    return (await this.repos()).assignment.loadUnconfirmedByServiceDateRange();
  }

  public async loadPosition(churchId: string, positionId: string) {
    return (await (await this.repos()).position.load(churchId, positionId)) ?? null;
  }

  public async loadPlan(churchId: string, planId: string) {
    return (await (await this.repos()).plan.load(churchId, planId)) ?? null;
  }

  public async loadPlanType(churchId: string, planTypeId: string) {
    return (await (await this.repos()).planType.load(churchId, planTypeId)) ?? null;
  }
}

let _instance: DoingModuleGateway;
export const getDoingModuleGateway = (): DoingModuleGateway => (_instance ??= new DoingModuleGatewayDb());
