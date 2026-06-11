import { EmailHelper } from "@churchapps/apihelper";
import { Repos } from "../repositories/index.js";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";
import { Environment } from "../../../shared/helpers/Environment.js";

export interface PendingBookingRow {
  id?: string;
  churchId?: string;
  eventId?: string;
  roomId?: string;
  resourceId?: string;
  quantity?: number;
  eventTitle?: string;
  eventStart?: Date | string;
  roomName?: string;
  resourceName?: string;
  roomApprovalGroupId?: string;
  resourceApprovalGroupId?: string;
}

export interface ApprovalDigest {
  churchId: string;
  approvalGroupId: string;
  bookingIds: string[];
  items: { eventTitle: string; eventStart: Date | string; targetName: string }[];
}

export class ApprovalHelper {
  // Auto-approval-if-requester-is-member: no approval group means no approval
  // needed; members of the approval group skip the queue.
  public static determineStatus(approvalGroupId: string | null | undefined, requesterGroupIds: string[]): "approved" | "pending" {
    if (!approvalGroupId) return "approved";
    return requesterGroupIds.includes(approvalGroupId) ? "approved" : "pending";
  }

  // Groups pending bookings by church + approval group so each group's
  // approvers get one digest email covering everything new.
  public static buildDigests(rows: PendingBookingRow[]): ApprovalDigest[] {
    const byKey = new Map<string, ApprovalDigest>();
    for (const row of rows) {
      const approvalGroupId = row.roomId ? row.roomApprovalGroupId : row.resourceApprovalGroupId;
      if (!approvalGroupId) continue;
      const key = row.churchId + "/" + approvalGroupId;
      if (!byKey.has(key)) byKey.set(key, { churchId: row.churchId, approvalGroupId, bookingIds: [], items: [] });
      const digest = byKey.get(key);
      digest.bookingIds.push(row.id);
      const name = row.roomName || row.resourceName || "(unknown)";
      digest.items.push({
        eventTitle: row.eventTitle || "(untitled event)",
        eventStart: row.eventStart,
        targetName: name + (row.quantity > 1 ? ` × ${row.quantity}` : "")
      });
    }
    return Array.from(byKey.values());
  }

  // 30-minute batched approvals: one email per approver per approval group,
  // covering every request since the last digest. Called from the 30-min timer.
  public static async sendApprovalDigests(): Promise<{ digests: number; emails: number }> {
    const repos = await RepoManager.getRepos<Repos>("content");
    const pending = await repos.eventBooking.loadUnnotifiedPending();
    const digests = this.buildDigests(pending);
    let emails = 0;
    for (const digest of digests) {
      try {
        const approverIds = await getMembershipModuleGateway().loadGroupMemberPersonIds(digest.churchId, digest.approvalGroupId);
        for (const personId of approverIds) {
          const person = await getMembershipModuleGateway().loadPerson(digest.churchId, personId);
          if (!person?.email) continue;
          await EmailHelper.sendTemplatedEmail(Environment.supportEmail, person.email, "B1.church", Environment.b1AdminRoot ?? "", this.getDigestSubject(digest), this.getDigestBody(digest), "ChurchEmailTemplate.html");
          emails++;
        }
        await repos.eventBooking.markNotified(digest.bookingIds);
      } catch (e) {
        console.error(`[ApprovalHelper] Digest failed for church ${digest.churchId} group ${digest.approvalGroupId}:`, e);
      }
    }
    return { digests: digests.length, emails };
  }

  private static getDigestSubject(digest: ApprovalDigest): string {
    return digest.items.length === 1 ? "1 room/resource request awaiting approval" : `${digest.items.length} room/resource requests awaiting approval`;
  }

  private static getDigestBody(digest: ApprovalDigest): string {
    const rows = digest.items.map((i) => `<li><b>${i.targetName}</b> for "${i.eventTitle}" starting ${new Date(i.eventStart).toLocaleString()}</li>`).join("");
    const link = (Environment.b1AdminRoot ?? "") + "/calendars/approvals";
    return `<h2>Pending Approvals</h2><ul>${rows}</ul><p><a href="${link}">Review requests</a></p>`;
  }
}
