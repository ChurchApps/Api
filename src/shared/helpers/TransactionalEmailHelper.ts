import { EmailHelper } from "@churchapps/apihelper";

// Allowlist: auth codes, password resets, invites, receipts ONLY — everything else goes through the notification funnel.
export class TransactionalEmailHelper {
  static sendTransactional(
    from: string,
    to: string,
    appName: string,
    appUrl: string,
    subject: string,
    contents: string,
    template?: "EmailTemplate.html" | "ChurchEmailTemplate.html",
    replyTo?: string
  ): Promise<void> {
    return EmailHelper.sendTemplatedEmail(from, to, appName, appUrl, subject, contents, template, replyTo);
  }
}
