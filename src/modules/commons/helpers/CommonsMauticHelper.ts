import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";
import { MauticHelper } from "../../membership/helpers/MauticHelper.js";
import { Asset } from "../models/index.js";
import { Repos } from "../repositories/Repos.js";
import { CommonsMailHelper } from "./CommonsMailHelper.js";

// A writer crossing either line in a day gets flagged to support and tagged in Mautic so milestone emails hold off.
// UPLOAD_BURST matches MAX_PENDING_PER_USER: a fresh account filling the whole review queue in one day.
export const UPLOAD_BURST = 5;
export const SAVE_BURST = 25;
export const BURST_HOURS = 24;

interface MarketingUser { email: string; firstName?: string; lastName?: string }

async function loadUser(userId: string | undefined): Promise<MarketingUser | undefined> {
  if (!userId) return undefined;
  const repos = await RepoManager.getRepos<any>("membership");
  const users: any[] = await repos.user.loadByIds([userId]);
  return users?.[0]?.email ? users[0] : undefined;
}

export class CommonsMauticHelper {
  /** Tags the Mautic contact for a membership user (fire and forget) so
   *  marketing can see product wins like saved songs and submissions. */
  static tagUser = async (userId: string | undefined, tag: string): Promise<void> => {
    try {
      const user = await loadUser(userId);
      if (!user) return;
      // createAndTag upserts: tags the existing contact, or creates one first.
      // (Seen in production: a song submitted before the contact existed lost its tag.)
      await MauticHelper.createAndTag(user.email, user.firstName, user.lastName, tag);
    } catch (e) {
      console.error("[CommonsMauticHelper] tag failed:", e);
    }
  };

  /** Pushes a writer's milestone counts (songs live, saves by others) onto their Mautic contact; segments pick the milestone. */
  static syncWriter = async (repos: Repos, userId: string | undefined): Promise<void> => {
    try {
      const user = await loadUser(userId);
      if (!user) return;
      const [songs, saves] = await Promise.all([repos.asset.countPublishedSongs(userId || ""), repos.rating.countSavesOfPublisher(userId || "")]);
      await MauticHelper.createAndUpdate(user.email, user.firstName, user.lastName, { wc_songs_published: songs, wc_song_saves: saves });
    } catch (e) {
      console.error("[CommonsMauticHelper] writer sync failed:", e);
    }
  };

  /** Nightly: resync every song publisher so takedowns and unsaves lower the counts too. */
  static syncAllWriters = async (repos: Repos): Promise<{ writers: number }> => {
    const ids = await repos.asset.loadSongPublisherIds();
    for (const id of ids) await CommonsMauticHelper.syncWriter(repos, id);
    return { writers: ids.length };
  };

  /** After someone saves or unsaves a song: refresh the writer's counts, and flag a sudden pile of saves. */
  static afterSave = async (repos: Repos, asset: Asset, saverId: string, saved: boolean): Promise<void> => {
    const writerId = asset.publisherUserId;
    if (!writerId || writerId === saverId || asset.assetType !== "song") return;
    await CommonsMauticHelper.syncWriter(repos, writerId);
    if (!saved) return;
    try {
      // == so the alert fires once, on the save that crosses the line, not on every save after it
      const recent = await repos.rating.countSavesOfPublisher(writerId, BURST_HOURS);
      if (recent === SAVE_BURST) await CommonsMauticHelper.flag(writerId, "wc-flag-save-burst", `${recent} saves of their songs in the last ${BURST_HOURS} hours`);
    } catch (e) {
      console.error("[CommonsMauticHelper] save burst check failed:", e);
    }
  };

  /** After a new song goes to review: flag an account sending a pile of songs in one day. */
  static afterSubmit = async (repos: Repos, userId: string): Promise<void> => {
    try {
      const recent = await repos.submission.countNewSongsSubmittedSince(userId, BURST_HOURS);
      if (recent === UPLOAD_BURST) await CommonsMauticHelper.flag(userId, "wc-flag-upload-burst", `${recent} new songs sent for review in the last ${BURST_HOURS} hours`);
    } catch (e) {
      console.error("[CommonsMauticHelper] upload burst check failed:", e);
    }
  };

  private static flag = async (userId: string, tag: string, what: string): Promise<void> => {
    const user = await loadUser(userId);
    await CommonsMauticHelper.tagUser(userId, tag);
    await CommonsMailHelper.notifyWriterFlag(user?.email || userId, [user?.firstName, user?.lastName].filter(Boolean).join(" "), what);
  };
}
