import { getMembershipModuleGateway, getMessagingModuleGateway } from "../../../shared/modules/index.js";
import { groupOverviewByPerson, OverviewEmailRow } from "./MatrixEmailHelper.js";

// Serving overview "Text Volunteers": one text per assigned volunteer in the date range, through the church's own provider. Skips opted-out people, missing numbers, and repeat numbers (shared family phones).

const RECIPIENT_CAP = 200;

// Same shape as the group texting preview/send responses so B1Admin's SendTextDialog renders either.
export interface MatrixTextResult {
  totalMembers: number;
  eligibleCount: number;
  optedOutCount: number;
  noPhoneCount: number;
  capped: boolean;
  recipientCount?: number;
  successCount?: number;
  failCount?: number;
  error?: string;
}

const phoneKey = (phone: string) => phone.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");

export class MatrixTextHelper {
  public static async resolve(churchId: string, rows: OverviewEmailRow[]) {
    const schedules = groupOverviewByPerson(rows);
    const capped = schedules.length > RECIPIENT_CAP;
    const membership = getMembershipModuleGateway();
    const eligible: { personId: string; phoneNumber: string; firstName?: string; lastName?: string; displayName?: string }[] = [];
    let optedOutCount = 0;
    let noPhoneCount = 0;
    const seen = new Set<string>();
    for (const sched of schedules.slice(0, RECIPIENT_CAP)) {
      const person = await membership.loadPerson(churchId, sched.personId);
      const phoneNumber = (person?.mobilePhone || "").trim();
      if (!person || !phoneNumber) { noPhoneCount++; continue; }
      if (person.optedOut === true || person.optedOut === 1) { optedOutCount++; continue; }
      const key = phoneKey(phoneNumber);
      if (seen.has(key)) continue;
      seen.add(key);
      eligible.push({ personId: sched.personId, phoneNumber, firstName: person.firstName, lastName: person.lastName, displayName: person.displayName });
    }
    return { totalMembers: schedules.length, eligible, optedOutCount, noPhoneCount, capped };
  }

  public static async preview(churchId: string, rows: OverviewEmailRow[]): Promise<MatrixTextResult> {
    const { eligible, ...counts } = await this.resolve(churchId, rows);
    return { ...counts, eligibleCount: eligible.length };
  }

  public static async send(churchId: string, rows: OverviewEmailRow[], message: string): Promise<MatrixTextResult> {
    const { eligible, ...counts } = await this.resolve(churchId, rows);
    const church = await getMembershipModuleGateway().loadChurch(churchId);
    const messaging = getMessagingModuleGateway();
    let successCount = 0;
    let failCount = 0;
    for (const recipient of eligible) {
      const result = await messaging.sendPersonText(churchId, recipient.personId, recipient, message, church?.name || "");
      if (result.ok) successCount++;
      else if (result.reason === "no_provider" || result.reason === "insufficient_credits") return { ...counts, eligibleCount: eligible.length, recipientCount: eligible.length, successCount, failCount, error: result.reason };
      else failCount++;
    }
    return { ...counts, eligibleCount: eligible.length, recipientCount: eligible.length, successCount, failCount };
  }
}
