import { SNSEvent } from "aws-lambda";
import { RepoManager } from "../shared/infrastructure/RepoManager.js";
import type { Repos as MessagingRepos } from "../modules/messaging/repositories/index.js";

const MIN_MS = 60 * 1000;

// The subset of the SES bounce/complaint notification body this handler reads.
interface SesRecipient { emailAddress: string }
export interface SesFeedbackMessage {
  notificationType?: string;
  mail?: { timestamp?: string };
  complaint?: { complainedRecipients?: SesRecipient[]; complaintFeedbackType?: string };
  bounce?: { bounceType?: string; bounceSubType?: string; bouncedRecipients?: SesRecipient[] };
}

// SES bounce/complaint notifications arrive via SNS. Each is pinned to the church whose church-authored email
// went to that address at that moment, so ChurchEmailLimiter can pause a church that is generating them.
export const handleSesFeedback = async (event: SNSEvent): Promise<void> => {
  const repos = await RepoManager.getRepos<MessagingRepos>("messaging");
  for (const record of event.Records || []) {
    let msg: SesFeedbackMessage;
    try {
      msg = JSON.parse(record.Sns.Message) as SesFeedbackMessage;
    } catch {
      console.warn("[sesFeedback] skipping unparseable record", record.Sns?.MessageId);
      continue;
    }
    const feedback = parseFeedback(msg);
    if (!feedback) continue;
    const sentAt = new Date(msg.mail?.timestamp || Date.now());
    for (const address of feedback.addresses) {
      const log = await repos.deliveryLog.findChurchEmailByAddress(address, new Date(sentAt.getTime() - 2 * MIN_MS), new Date(sentAt.getTime() + 10 * MIN_MS));
      if (!log) continue;
      await repos.deliveryLog.save({ churchId: log.churchId, personId: log.personId, contentType: log.contentType, deliveryMethod: feedback.method, deliveryAddress: address, success: false, errorMessage: feedback.detail });
      console.log(`[sesFeedback] ${feedback.method} ${log.churchId} ${address}`);
    }
  }
};

export function parseFeedback(msg: SesFeedbackMessage): { method: "sesBounce" | "sesComplaint"; addresses: string[]; detail: string } | null {
  if (msg?.notificationType === "Complaint") {
    return { method: "sesComplaint", addresses: (msg.complaint?.complainedRecipients || []).map((r: SesRecipient) => r.emailAddress), detail: msg.complaint?.complaintFeedbackType || "complaint" };
  }
  // Transient bounces (full mailbox, etc.) say nothing about list quality.
  if (msg?.notificationType === "Bounce" && msg.bounce?.bounceType === "Permanent") {
    return { method: "sesBounce", addresses: (msg.bounce.bouncedRecipients || []).map((r: SesRecipient) => r.emailAddress), detail: msg.bounce.bounceSubType || "Permanent" };
  }
  return null;
}
