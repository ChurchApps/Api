import { RepoManager } from "../infrastructure/RepoManager.js";
import { MergeFieldHelper } from "../../modules/messaging/helpers/MergeFieldHelper.js";
import { NotificationHelper } from "../../modules/messaging/helpers/NotificationHelper.js";

interface EmailRecipient {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email: string;
}

// Gateway: the only seam through which other modules read/write messaging data.
export interface MessagingModuleGateway {
  loadDevicesByPerson(churchId: string, personId: string): Promise<any[]>;
  loadNotificationsByPerson(churchId: string, personId: string): Promise<any[]>;
  loadNotificationPreferencesByPerson(churchId: string, personId: string): Promise<any[]>;
  loadPrivateMessagesByPerson(churchId: string, personId: string): Promise<any[]>;
  createNotifications(notifications: any[]): Promise<any[]>;
  // Render a saved EmailTemplate (merge fields resolved against recipient + church) and send it
  // through the notification funnel (preference-gated). Returns false when the template is
  // missing or the recipient has no email.
  sendTemplatedEmail(churchId: string, personId: string, templateId: string, recipient: EmailRecipient, churchName: string, subjectOverride?: string): Promise<boolean>;
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

  public async sendTemplatedEmail(churchId: string, personId: string, templateId: string, recipient: EmailRecipient, churchName: string, subjectOverride?: string): Promise<boolean> {
    if (!recipient?.email) return false;
    const repos = await this.repos();
    const template = await repos.emailTemplate.loadById(churchId, templateId);
    if (!template) return false;
    const church = { name: churchName };
    const subject = MergeFieldHelper.resolve(subjectOverride || template.subject || "", recipient, church);
    const body = MergeFieldHelper.resolve(template.htmlContent || "", recipient, church);
    await NotificationHelper.createNotifications([personId], churchId, "task", templateId, subject, undefined, undefined, {
      category: "announcements",
      deliveryStartLevel: 2,
      emailImmediate: true,
      emailByPerson: { [personId]: { subject, html: body } }
    });
    return true;
  }
}

let _instance: MessagingModuleGateway;
export const getMessagingModuleGateway = (): MessagingModuleGateway => (_instance ??= new MessagingModuleGatewayDb());
