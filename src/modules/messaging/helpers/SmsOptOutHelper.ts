import crypto from "crypto";
import { Environment } from "../../../shared/helpers/Environment.js";
import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";
import { Repos } from "../repositories/index.js";
import { MembershipRepos } from "./ForeignRepos.js";

// Carrier opt-out words (CTIA). A reply that is exactly one of these opts the number out.
const STOP_WORDS = new Set([
  "STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "REVOKE"
]);
const START_WORDS = new Set(["START", "UNSTOP"]);
const keyword = (text: string) => (text || "").trim().replace(/[^a-z]/gi, "").toUpperCase();

// Inbound webhook fields; values are whatever the provider sent.
type InboundSmsFields = { [field: string]: unknown; subscriber?: InboundSmsFields };

const first = (...values: unknown[]): string => {
  for (const v of values) if (typeof v === "string" && v.trim()) return v.trim();
  return "";
};

// Inbound STOP webhook for the church's texting provider. The URL carries an HMAC of the churchId, so only the church's own provider (given the URL from Settings) can opt numbers out.
export class SmsOptOutHelper {
  static token(churchId: string): string {
    if (!Environment.jwtSecret) throw new Error("jwtSecret is not configured");
    return crypto.createHmac("sha256", Environment.jwtSecret).update(`sms-inbound:${churchId}`).digest("hex").slice(0, 32);
  }

  static verify(churchId: string, token: string | undefined): boolean {
    if (!churchId || !token || !Environment.jwtSecret) return false;
    const a = crypto.createHash("sha256").update(token).digest();
    const b = crypto.createHash("sha256").update(this.token(churchId)).digest();
    return crypto.timingSafeEqual(a, b);
  }

  static inboundUrl(churchId: string): string {
    return `${Environment.messagingApi}/texting/inbound/${churchId}/${this.token(churchId)}`;
  }

  static isStop(text: string): boolean {
    return STOP_WORDS.has(keyword(text));
  }

  static isStart(text: string): boolean {
    return START_WORDS.has(keyword(text));
  }

  // Providers post different shapes (Twilio-style form fields, Clearstream/TextInChurch JSON); pull the sender and the reply text.
  static parse(body: unknown): { from: string; text: string } {
    const b = (body || {}) as InboundSmsFields;
    const data = (b.data || b.message || {}) as InboundSmsFields;
    const from = first(b.From, b.from, b.phone, b.mobile_number, b.sender, data.from, data.mobile_number, data.subscriber?.mobile_number, b.subscriber?.mobile_number);
    const text = first(b.Body, b.body, b.text, b.keyword, typeof b.message === "string" ? b.message : "", data.text, data.body, data.keyword);
    return { from, text };
  }

  // Marks every matching person opted out of texts and turns their text reminders off. Returns how many people matched.
  static async optOut(churchId: string, phone: string): Promise<number> {
    const digits = (phone || "").replace(/\D/g, "");
    if (digits.length < 7) return 0;
    const membership = await RepoManager.getRepos<MembershipRepos>("membership");
    const messaging = await RepoManager.getRepos<Repos>("messaging");
    const personIds: string[] = await membership.person.loadIdsByMobileDigits(churchId, digits);
    for (const personId of personIds) {
      await membership.person.updateSmsOptedOut(churchId, personId, true);
      const pref = await messaging.notificationPreference.loadByPersonId(churchId, personId);
      if (pref?.allowSms) await messaging.notificationPreference.save({ ...pref, allowSms: false });
    }
    return personIds.length;
  }

  // START lifts the text opt-out only; text reminders stay off until staff turn them back on.
  static async optIn(churchId: string, phone: string): Promise<number> {
    const digits = (phone || "").replace(/\D/g, "");
    if (digits.length < 7) return 0;
    const membership = await RepoManager.getRepos<MembershipRepos>("membership");
    const personIds: string[] = await membership.person.loadIdsByMobileDigits(churchId, digits);
    for (const personId of personIds) await membership.person.updateSmsOptedOut(churchId, personId, false);
    return personIds.length;
  }
}
