import { Permissions } from "../../../shared/helpers/Permissions.js";

interface AccessUser { churchId: string; checkAccess: (permission: any) => boolean }

// Edit Donations may change anything. Enter Donations may only add or change donations in a batch that is still open,
// so a treasurer can close a counted batch and know it stays the way it was closed. Gifts that came through a
// payment gateway (they carry a transactionId) stay Edit Donations only.
export class BatchAccessHelper {
  public static isOpen(batch: { status?: string | null } | null | undefined) {
    return !!batch && batch.status !== "closed";
  }

  public static canEnter(au: AccessUser) {
    return au.checkAccess(Permissions.donations.edit) || au.checkAccess(Permissions.donations.enter);
  }

  public static async isBatchOpen(repos: any, churchId: string, batchId: string | null | undefined) {
    if (!batchId) return false;
    return this.isOpen(await repos.donationBatch.load(churchId, batchId));
  }

  // The donation's current batch (when it exists) and the batch it is being saved into must both be open.
  public static async canChangeDonation(repos: any, au: AccessUser, donation: { id?: string; batchId?: string }) {
    if (au.checkAccess(Permissions.donations.edit)) return true;
    if (!au.checkAccess(Permissions.donations.enter)) return false;
    if (donation.id) {
      const existing = await repos.donation.load(au.churchId, donation.id);
      if (existing && (existing.transactionId || !(await this.isBatchOpen(repos, au.churchId, existing.batchId)))) return false;
    }
    return this.isBatchOpen(repos, au.churchId, donation.batchId);
  }

  public static async canDeleteDonation(repos: any, au: AccessUser, donationId: string) {
    if (au.checkAccess(Permissions.donations.edit)) return true;
    if (!au.checkAccess(Permissions.donations.enter)) return false;
    const existing = await repos.donation.load(au.churchId, donationId);
    return !!existing && !existing.transactionId && this.isBatchOpen(repos, au.churchId, existing.batchId);
  }

  // A fund split belongs to its donation, so it follows the donation's batch.
  public static async canChangeFundDonation(repos: any, au: AccessUser, fundDonation: { id?: string; donationId?: string }) {
    if (au.checkAccess(Permissions.donations.edit)) return true;
    if (!au.checkAccess(Permissions.donations.enter)) return false;
    if (fundDonation.id) {
      const existing = await repos.fundDonation.load(au.churchId, fundDonation.id);
      if (existing && !(await this.canDeleteDonation(repos, au, existing.donationId))) return false;
    }
    return !!fundDonation.donationId && this.canDeleteDonation(repos, au, fundDonation.donationId);
  }

  public static async canDeleteFundDonation(repos: any, au: AccessUser, id: string) {
    if (au.checkAccess(Permissions.donations.edit)) return true;
    if (!au.checkAccess(Permissions.donations.enter)) return false;
    const existing = await repos.fundDonation.load(au.churchId, id);
    return !!existing && this.canDeleteDonation(repos, au, existing.donationId);
  }
}
