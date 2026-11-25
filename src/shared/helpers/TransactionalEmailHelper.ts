import { EmailHelper } from "@churchapps/apihelper";
import { Environment } from "./Environment.js";

// Allowlist: auth codes, password resets, invites, receipts ONLY — everything else goes through the notification funnel.
export class TransactionalEmailHelper {
  // `"Church Name" <support@…>` so inboxes show the church instead of "support". Same address, so SES identity/SPF/DKIM are unchanged.
  static fromAddress(displayName?: string | null, address: string = Environment.supportEmail || "support@churchapps.org"): string {
    const name = (displayName || "").replace(/[\x00-\x1f\x7f"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 64).trim();
    if (!name) return address;
    // SES Source must be ASCII; encode anything else as RFC 2047.
    const display = /^[\x20-\x7e]*$/.test(name) ? name : `=?UTF-8?B?${Buffer.from(name, "utf8").toString("base64")}?=`;
    return `"${display}" <${address}>`;
  }

  // A church's logoLight setting, when it is safe to put in an email (https only, so mail clients don't block it).
  static logoUrl(stored?: string | null): string | undefined {
    return typeof stored === "string" && /^https:\/\//i.test(stored) ? stored : undefined;
  }

  static sendTransactional(
    from: string,
    to: string,
    appName: string,
    appUrl: string,
    subject: string,
    contents: string,
    template?: "EmailTemplate.html" | "ChurchEmailTemplate.html",
    replyTo?: string,
    logoUrl?: string
  ): Promise<void> {
    return EmailHelper.sendTemplatedEmail(from, to, appName, appUrl, subject, contents, template, replyTo, logoUrl);
  }
}
