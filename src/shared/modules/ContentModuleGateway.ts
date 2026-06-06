import { RepoManager } from "../infrastructure/RepoManager.js";

// Gateway: the only seam through which other modules read content data.
export interface ContentModuleGateway {
  loadRegistrationsByPerson(churchId: string, personId: string): Promise<any[]>;
}

class ContentModuleGatewayDb implements ContentModuleGateway {
  private async repos() {
    return RepoManager.getRepos<any>("content");
  }

  public async loadRegistrationsByPerson(churchId: string, personId: string) {
    return (await this.repos()).registration.loadForPerson(churchId, personId);
  }
}

let _instance: ContentModuleGateway;
export const getContentModuleGateway = (): ContentModuleGateway => (_instance ??= new ContentModuleGatewayDb());
