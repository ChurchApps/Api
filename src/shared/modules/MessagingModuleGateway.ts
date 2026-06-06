import { RepoManager } from "../infrastructure/RepoManager.js";

// Gateway: the only seam through which other modules read/write messaging data.
export interface MessagingModuleGateway {
  loadDevicesByPerson(churchId: string, personId: string): Promise<any[]>;
  loadNotificationsByPerson(churchId: string, personId: string): Promise<any[]>;
  loadNotificationPreferencesByPerson(churchId: string, personId: string): Promise<any[]>;
  loadPrivateMessagesByPerson(churchId: string, personId: string): Promise<any[]>;
  createNotifications(notifications: any[]): Promise<any[]>;
}

class MessagingModuleGatewayDb implements MessagingModuleGateway {
  private async repos() {
    return RepoManager.getRepos<any>("messaging");
  }

  public async loadDevicesByPerson(churchId: string, personId: string) {
    return (await this.repos()).device.loadByPersonId(churchId, personId);
  }

  public async loadNotificationsByPerson(churchId: string, personId: string) {
    return (await this.repos()).notification.loadByPersonId(churchId, personId);
  }

  public async loadNotificationPreferencesByPerson(churchId: string, personId: string) {
    return (await this.repos()).notificationPreference.loadByPersonId(churchId, personId);
  }

  public async loadPrivateMessagesByPerson(churchId: string, personId: string) {
    return (await this.repos()).privateMessage.loadByPersonId(churchId, personId);
  }

  public async createNotifications(notifications: any[]) {
    const repos = await this.repos();
    return Promise.all(notifications.map((n) => repos.notification.save(n)));
  }
}

let _instance: MessagingModuleGateway;
export const getMessagingModuleGateway = (): MessagingModuleGateway => (_instance ??= new MessagingModuleGatewayDb());
