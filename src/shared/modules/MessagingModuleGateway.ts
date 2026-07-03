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
  // Ad-hoc bulk SMS (check-in paging/broadcast). Recipients are pre-filtered by the
  // caller (opt-out/no-phone already removed). Returns { ok:false, reason:"no_provider" }
  // when the church has no active texting provider. Caps at 500 recipients.
  sendBulkText(churchId: string, recipients: BulkTextRecipient[], message: string, context?: string): Promise<BulkTextResult>;
}

export interface BulkTextRecipient {
  personId?: string;
  phoneNumber: string;
}

export interface BulkTextResult {
  ok: boolean;
  reason?: string;
  sent?: number;
  failed?: number;
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

  public async sendBulkText(churchId: string, recipients: BulkTextRecipient[], message: string, _context?: string): Promise<BulkTextResult> {
    const capped = recipients.slice(0, 500);
    if (capped.length === 0) return { ok: true, sent: 0, failed: 0 };

    const repos = await this.repos();
    const config = await this.getTextingConfig(repos, churchId);
    if (!config) return { ok: false, reason: "no_provider" };

    // Dynamic import keeps the texting provider dep out of this module's eager load graph.
    const { getProvider } = await import("@churchapps/texting");
    const provider = getProvider(config.providerName);

    const phones = capped.map((r) => r.phoneNumber);
    const results = await provider.sendBulk(config, phones, message);
    const successCount = results.filter((r: any) => r.success).length;
    const failCount = results.length - successCount;

    const savedSentText = await repos.sentText.save({
      churchId,
      groupId: null,
      message,
      recipientCount: capped.length,
      successCount,
      failCount
    });

    const logPromises: Promise<any>[] = [];
    capped.forEach((r, i) => {
      logPromises.push(repos.deliveryLog.save({
        churchId,
        personId: r.personId,
        contentType: "sentText",
        contentId: savedSentText.id,
        deliveryMethod: "sms",
        deliveryAddress: r.phoneNumber,
        success: results[i]?.success ?? false,
        errorMessage: results[i]?.error
      }));
    });
    await Promise.allSettled(logPromises);

    return { ok: true, sent: successCount, failed: failCount };
  }

  private async getTextingConfig(repos: any, churchId: string): Promise<any | null> {
    const { EncryptionHelper } = await import("@churchapps/apihelper");
    const providers = await repos.textingProvider.loadByChurchId(churchId);
    const list = repos.textingProvider.convertAllToModel(providers as any[]);
    if (!list.length) return null;
    const p = list[0];
    if (!p.enabled) return null;
    return {
      providerName: p.provider,
      churchId,
      apiKey: p.apiKey ? EncryptionHelper.decrypt(p.apiKey) : "",
      apiSecret: p.apiSecret ? EncryptionHelper.decrypt(p.apiSecret) : "",
      fromNumber: p.fromNumber
    };
  }
}

let _instance: MessagingModuleGateway;
export const getMessagingModuleGateway = (): MessagingModuleGateway => (_instance ??= new MessagingModuleGatewayDb());
