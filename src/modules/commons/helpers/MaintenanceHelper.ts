import { Repos } from "../repositories/Repos.js";
import { PublishHelper } from "./PublishHelper.js";

export const DOWNLOAD_RETENTION_DAYS = 90;
export const DRAFT_RETENTION_DAYS = 14;

/** Midnight housekeeping: the counters on assets are the permanent record, the dedupe rows and abandoned drafts are not. */
export class MaintenanceHelper {
  static async nightly(repos: Repos): Promise<{ prunedDownloads: number; deletedDrafts: number }> {
    const prunedDownloads = await repos.asset.pruneDownloads(DOWNLOAD_RETENTION_DAYS);
    let deletedDrafts = 0;
    for (const draft of await repos.submission.loadStaleDrafts(DRAFT_RETENTION_DAYS)) {
      const asset = await repos.asset.loadById(draft.assetId || "");
      await PublishHelper.discardProposed(repos, draft, asset, true);
      deletedDrafts++;
    }
    return { prunedDownloads, deletedDrafts };
  }
}
