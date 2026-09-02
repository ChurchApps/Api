import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";
import { Environment } from "../../../shared/helpers/Environment.js";
import { TransactionalEmailHelper } from "../../../shared/helpers/TransactionalEmailHelper.js";
import { Asset, Report, Submission } from "../models/index.js";

const APP = "WorshipCommons";

const REJECT_REASONS: Record<string, string> = {
  quality: "It didn't meet the library's quality bar.",
  duplicate: "It looks like a duplicate of something already in the library.",
  licensing: "We couldn't confirm the licensing for this work.",
  offtopic: "It isn't a fit for the WorshipCommons library.",
  incomplete: "The submission was missing required information or files.",
  other: "A reviewer decided not to add it at this time."
};

const RESOLUTION_TEXT: Record<string, string> = {
  upheld: "We agreed with your report and acted on it.",
  dismissed: "We reviewed it and decided no action was needed.",
  duplicate: "We had already received this report and it is being handled there."
};

function reportedTitle(report: Report): string {
  return (report.contentText || "").trim() || "the content you reported";
}

function titleOf(sub: Submission): string {
  return (sub.payload?.name || "").trim() || "your submission";
}

function siteRoot(): string {
  return (Environment.worshipCommonsRoot || "").replace(/\/$/, "");
}

export class CommonsMailHelper {
  static notifyReceived(sub: Submission): Promise<void> {
    const title = titleOf(sub);
    const root = siteRoot();
    return this.mailWriter(sub.submittedBy, `We received ${title}`, `<p>We received <strong>${title}</strong> and a human reviewer will look at it, usually within a few days.</p><p>Track it at <a href="${root}/my-songs">${root}/my-songs</a>.</p>`);
  }

  static notifyApproved(sub: Submission, assetId: string): Promise<void> {
    const title = titleOf(sub);
    const root = siteRoot();
    return this.mailWriter(sub.submittedBy, `${title} is live on WorshipCommons`, `<p><strong>${title}</strong> is now in the library.</p><p><a href="${root}/songs/${assetId}">${root}/songs/${assetId}</a></p>`);
  }

  static notifyRejected(sub: Submission, reason: string, note?: string): Promise<void> {
    const title = titleOf(sub);
    const why = REJECT_REASONS[reason] || REJECT_REASONS.other;
    let body = `<p><strong>${title}</strong> didn't make the WorshipCommons library.</p><p>${why}</p>`;
    if (note?.trim()) body += `<p>${note.trim()}</p>`;
    body += `<p>Questions? Email ${Environment.supportEmail}.</p>`;
    return this.mailWriter(sub.submittedBy, `An update on ${title}`, body);
  }

  static async notifyReviewerDigest(pending: number, stale = 0): Promise<void> {
    if (pending <= 0 || !Environment.supportEmail) return;
    const link = `${(Environment.b1AdminRoot || "").replace(/\/$/, "")}/admin?tab=commons`;
    const staleBit = stale > 0 ? ` (${stale} older than 72 hours)` : "";
    const subject = `${pending} WorshipCommons submissions waiting`;
    const contents = `<p>${pending} WorshipCommons submissions waiting${staleBit}.</p><p><a href="${link}">${link}</a></p>`;
    try {
      await TransactionalEmailHelper.sendTransactional(Environment.supportEmail, Environment.supportEmail, APP, Environment.worshipCommonsRoot || "", subject, contents);
    } catch (e) {
      console.error("[CommonsMailHelper] reviewer digest failed:", e);
    }
  }

  /** Reporters may be anonymous, so these go to the address on the report itself. */
  static notifyReportReceived(report: Report): Promise<void> {
    return this.mailTo(report.email, `We received your report (${report.id})`, `<p>We received your report about <strong>${reportedTitle(report)}</strong>.</p><p>Your reference is <strong>${report.id}</strong>. A reviewer will look at it and email you when it is resolved.</p><p>Questions? Email ${Environment.supportEmail}.</p>`);
  }

  static notifyReportResolved(report: Report, resolution: string): Promise<void> {
    const what = RESOLUTION_TEXT[resolution] || RESOLUTION_TEXT.dismissed;
    let body = `<p>Your report about <strong>${reportedTitle(report)}</strong> (reference <strong>${report.id}</strong>) is resolved.</p><p>${what}</p>`;
    if (report.resolutionNote?.trim()) body += `<p>${report.resolutionNote.trim()}</p>`;
    body += `<p>Questions? Email ${Environment.supportEmail}.</p>`;
    return this.mailTo(report.email, `Your report (${report.id}) is resolved`, body);
  }

  /** The publisher of a song taken down by a report — reply-to-counter-notice is the appeal path. */
  static notifyTakedown(asset: Asset, report: Report): Promise<void> {
    const title = (asset.name || "").trim() || "your song";
    const why = report.reason === "copyright" ? "a copyright report" : "a policy report";
    return this.mailWriter(asset.publisherUserId, `${title} was taken down from WorshipCommons`, `<p><strong>${title}</strong> is no longer available on WorshipCommons after ${why}.</p><p>If you believe this is a mistake, reply to this email with a counter-notice explaining why you have the right to publish it.</p><p>Questions? Email ${Environment.supportEmail}.</p>`);
  }

  private static async mailWriter(userId: string | undefined, subject: string, contents: string): Promise<void> {
    try {
      if (!userId) return;
      const repos = await RepoManager.getRepos<any>("membership");
      const users: any[] = await repos.user.loadByIds([userId]);
      await this.mailTo(users?.[0]?.email, subject, contents);
    } catch (e) {
      console.error("[CommonsMailHelper] writer email failed:", e);
    }
  }

  private static async mailTo(email: string | undefined, subject: string, contents: string): Promise<void> {
    try {
      if (!email) return;
      await TransactionalEmailHelper.sendTransactional(Environment.supportEmail, email, APP, Environment.worshipCommonsRoot || "", subject, contents);
    } catch (e) {
      console.error("[CommonsMailHelper] email failed:", e);
    }
  }
}
