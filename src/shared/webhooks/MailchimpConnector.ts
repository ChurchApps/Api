import crypto from "crypto";
import { EncryptionHelper } from "@churchapps/apihelper";
import { Webhook, WebhookDelivery } from "../../modules/membership/models/index.js";

const REQUEST_TIMEOUT_MS = 10000;
const MAX_RESPONSE_BODY = 4000;

export interface MailchimpConfig {
  apiKey?: string;
  audienceId?: string;
}

// One-way sync only: B1 -> Mailchimp. Unsubscribes in Mailchimp do not flow back.
export const MAILCHIMP_EVENTS = [
  "person.created",
  "person.updated",
  "person.destroyed",
  "group.member.added",
  "group.member.removed",
  "list.member.added",
  "list.member.removed"
];

export class MailchimpConnector {
  public static dataCenter(apiKey: string): string | null {
    const match = /-([a-z]+\d+)$/.exec(apiKey ?? "");
    return match ? match[1] : null;
  }

  public static parseConfig(webhook: Webhook): MailchimpConfig | null {
    if (!webhook?.connectorConfig) return null;
    try { return JSON.parse(EncryptionHelper.decrypt(webhook.connectorConfig)); } catch { return null; }
  }

  // Returns an error message, or null when the key and audience check out.
  public static async verify(config: MailchimpConfig): Promise<string | null> {
    if (!config?.apiKey || !config?.audienceId) return "Mailchimp API key and Audience ID are required";
    const dc = MailchimpConnector.dataCenter(config.apiKey);
    if (!dc) return "Mailchimp API key must end with a data center suffix (e.g. -us21)";
    const res = await MailchimpConnector.request(config, "GET", `/lists/${config.audienceId}`);
    if (res.status === 200) return null;
    if (res.status === 401) return "Mailchimp rejected the API key";
    if (res.status === 404) return "Mailchimp audience not found — check the Audience ID";
    return `Mailchimp returned ${res.status || "no response"}: ${res.body.slice(0, 200)}`;
  }

  public static async deliver(webhook: Webhook, delivery: WebhookDelivery): Promise<{ status: number; responseBody: string }> {
    const config = MailchimpConnector.parseConfig(webhook);
    if (!config?.apiKey || !config?.audienceId) return { status: 0, responseBody: "Mailchimp connector is not configured" };

    let envelope: any = {};
    try { envelope = JSON.parse(delivery.payload ?? "{}"); } catch { return { status: 0, responseBody: "Invalid delivery payload" }; }
    const d = envelope.data ?? {};
    const email = (d.contactInfo?.email || d.email || d.personEmail || "").trim().toLowerCase();
    const hash = email ? crypto.createHash("md5").update(email).digest("hex") : "";

    switch (envelope.event) {
      case "person.created":
      case "person.updated": {
        if (!email) return MailchimpConnector.skip("person has no email address");
        return MailchimpConnector.upsertMember(config, hash, email, d);
      }
      case "person.destroyed": {
        if (!email) return MailchimpConnector.skip("no email in payload");
        const res = await MailchimpConnector.request(config, "DELETE", `/lists/${config.audienceId}/members/${hash}`);
        if (res.status === 404) return { status: 200, responseBody: "Subscriber not in audience — nothing to archive" };
        return { status: res.status, responseBody: res.body };
      }
      case "group.member.added":
      case "list.member.added": {
        const tag = d.groupName || d.listName;
        if (!email) return MailchimpConnector.skip("person has no email address");
        if (!tag) return MailchimpConnector.skip("no group/list name in payload");
        const upsert = await MailchimpConnector.upsertMember(config, hash, email, d);
        if (upsert.status < 200 || upsert.status >= 300) return upsert;
        return MailchimpConnector.setTag(config, hash, tag, "active");
      }
      case "group.member.removed":
      case "list.member.removed": {
        const tag = d.groupName || d.listName;
        if (!email) return MailchimpConnector.skip("person has no email address");
        if (!tag) return MailchimpConnector.skip("no group/list name in payload");
        const res = await MailchimpConnector.setTag(config, hash, tag, "inactive");
        if (res.status === 404) return { status: 200, responseBody: "Subscriber not in audience — nothing to untag" };
        return res;
      }
      default:
        return MailchimpConnector.skip(`event ${envelope.event} is not mapped for Mailchimp`);
    }
  }

  private static async upsertMember(config: MailchimpConfig, hash: string, email: string, d: any): Promise<{ status: number; responseBody: string }> {
    // Only Mailchimp's default merge fields — unknown fields make the whole call 400.
    const mergeFields: Record<string, string> = {};
    const first = d.name?.first || d.firstName;
    const last = d.name?.last || d.lastName;
    const phone = d.contactInfo?.mobilePhone || d.mobilePhone;
    if (first) mergeFields.FNAME = first;
    if (last) mergeFields.LNAME = last;
    if (phone) mergeFields.PHONE = phone;

    const body: any = { email_address: email, status_if_new: "subscribed" };
    if (Object.keys(mergeFields).length > 0) body.merge_fields = mergeFields;
    const res = await MailchimpConnector.request(config, "PUT", `/lists/${config.audienceId}/members/${hash}`, body);
    return { status: res.status, responseBody: res.body };
  }

  private static async setTag(config: MailchimpConfig, hash: string, tag: string, status: "active" | "inactive"): Promise<{ status: number; responseBody: string }> {
    const res = await MailchimpConnector.request(config, "POST", `/lists/${config.audienceId}/members/${hash}/tags`, { tags: [{ name: tag, status }] });
    return { status: res.status, responseBody: res.body || `Tag "${tag}" set to ${status}` };
  }

  private static skip(reason: string): { status: number; responseBody: string } {
    return { status: 200, responseBody: "Skipped: " + reason };
  }

  private static async request(config: MailchimpConfig, method: string, path: string, body?: any): Promise<{ status: number; body: string }> {
    const dc = MailchimpConnector.dataCenter(config.apiKey ?? "");
    if (!dc) return { status: 0, body: "Invalid API key format" };
    try {
      const res = await fetch(`https://${dc}.api.mailchimp.com/3.0${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "B1-Webhooks/1.0",
          "Authorization": "Basic " + Buffer.from("b1:" + config.apiKey).toString("base64")
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      return { status: res.status, body: (await res.text()).slice(0, MAX_RESPONSE_BODY) };
    } catch (e: any) {
      return { status: 0, body: ("Request failed: " + (e?.message ?? String(e))).slice(0, MAX_RESPONSE_BODY) };
    }
  }
}
