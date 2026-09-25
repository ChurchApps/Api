import { Repos } from "../repositories/Repos.js";
import { CommonsMailHelper } from "./CommonsMailHelper.js";
import { PublishHelper } from "./PublishHelper.js";

export const DOWNLOAD_RETENTION_DAYS = 90;
export const DRAFT_RETENTION_DAYS = 14;
// how long after an approve the timer keeps looking for the output/ the local publish job pushes
export const OUTPUT_SYNC_DAYS = 7;

/** Midnight housekeeping: the counters on assets are the permanent record, the dedupe rows and abandoned drafts are not. */
export class MaintenanceHelper {
  /**
   * Every 30 minutes: register what WorshipCommonsContent's tools/publish-approved.mjs pushed to output/ for recently
   * approved songs, so the job needs no API credentials. Idempotent; one S3 listing per song.
   */
  static async syncRecentOutput(repos: Repos): Promise<{ songs: number; added: number; removed: number }> {
    const out = { songs: 0, added: 0, removed: 0 };
    for (const id of await repos.submission.loadRecentlyApprovedSongIds(OUTPUT_SYNC_DAYS)) {
      const r = await PublishHelper.syncOutput(repos, id);
      if (!r) continue;
      out.songs++;
      out.added += r.added;
      out.removed += r.removed;
    }
    return out;
  }

  static async nightly(repos: Repos): Promise<{ prunedDownloads: number; deletedDrafts: number }> {
    const prunedDownloads = await repos.asset.pruneDownloads(DOWNLOAD_RETENTION_DAYS);
    let deletedDrafts = 0;
    for (const draft of await repos.submission.loadStaleDrafts(DRAFT_RETENTION_DAYS)) {
      const asset = await repos.asset.loadById(draft.assetId || "");
      await PublishHelper.discardProposed(repos, draft, asset, true);
      deletedDrafts++;
    }
    try {
      const pending = await repos.submission.countByStatus("pending");
      if (pending > 0) {
        const stale = await repos.submission.countPendingOlderThan(72);
        await CommonsMailHelper.notifyReviewerDigest(pending, stale);
      }
    } catch (e) {
      console.error("[CommonsMailHelper] reviewer digest failed:", e);
    }
    return { prunedDownloads, deletedDrafts };
  }
}
