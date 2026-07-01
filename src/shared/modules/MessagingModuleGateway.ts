import { EmailHelper } from "@churchapps/apihelper";
import { RepoManager } from "../infrastructure/RepoManager.js";
import { Environment } from "../helpers/Environment.js";
import { MergeFieldHelper } from "../../modules/messaging/helpers/MergeFieldHelper.js";

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
  // Render a saved EmailTemplate (merge fields resolved against recipient + church) and send it.
  // Returns false when the template is missing or the recipient has no email.
  sendTemplatedEmail(churchId: string, templateId: string, recipient: EmailRecipient, churchName: string, subjectOverride?: string): Promise<boolean>;
  // Unified cross-source reminder ledger (reminderSentLog): which keys already fired, and record new sends.
  loadSentReminderKeys(idempotencyKeys: string[]): Promise<string[]>;
  logReminderSends(rows: { churchId?: string; personId?: string; category?: string; entityType?: string; entityId?: string; idempotencyKey?: string }[]): Promise<void>;
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

  public async loadSentReminderKeys(idempotencyKeys: string[]): Promise<string[]> {
    return (await this.repos()).reminderSentLog.loadSentKeys(idempotencyKeys);
  }

  public async logReminderSends(rows: { churchId?: string; personId?: string; category?: string; entityType?: string; entityId?: string; idempotencyKey?: string }[]): Promise<void> {
    const repos = await this.repos();
    await Promise.all(rows.map((r) => repos.reminderSentLog.insertIgnore({ ...r, channel: "all", status: "sent" })));
  }

  public async sendTemplatedEmail(churchId: string, templateId: string, recipient: EmailRecipient, churchName: string, subjectOverride?: string): Promise<boolean> {
    if (!recipient?.email) return false;
    const repos = await this.repos();
    const template = await repos.emailTemplate.loadById(churchId, templateId);
    if (!template) return false;
    const church = { name: churchName };
    const subject = MergeFieldHelper.resolve(subjectOverride || template.subject || "", recipient, church);
    const body = MergeFieldHelper.resolve(template.htmlContent || "", recipient, church);
    await EmailHelper.sendTemplatedEmail(Environment.supportEmail, recipient.email, churchName || "B1", "", subject, body, "ChurchEmailTemplate.html");
    return true;
  }
}

let _instance: MessagingModuleGateway;
export const getMessagingModuleGateway = (): MessagingModuleGateway => (_instance ??= new MessagingModuleGatewayDb());
