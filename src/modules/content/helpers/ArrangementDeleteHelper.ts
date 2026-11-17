import { Repos } from "../repositories/index.js";
import { StorageResolver } from "./StorageResolver.js";

export class ArrangementDeleteHelper {
  // Removes an arrangement with everything hanging off it. Nothing cascades in the
  // database, so a bare row delete leaves keys, file rows and stored bytes behind.
  static async deleteArrangement(repos: Repos, churchId: string, arrangementId: string) {
    await repos.arrangement.delete(churchId, arrangementId);
    await repos.arrangementKey.deleteForArrangement(churchId, arrangementId);
    // audio (and other) files attached directly to the arrangement aren't cascaded by the row
    // delete above - remove the bytes too, or they orphan in storage and stay billed forever.
    const files = await repos.file.loadForContent(churchId, "arrangement", arrangementId);
    for (const file of files) {
      const storage = await StorageResolver.forFile(repos.storageProvider, file);
      const key = file.externalId || StorageResolver.keyFromUrl(file.contentPath);
      if (storage) await storage.provider.remove(key);
    }
    if (files.length > 0) await repos.file.deleteForContent(churchId, "arrangement", arrangementId);
  }

  // Deleting only the songs row used to leave its arrangements behind still holding their
  // freeShowId, so /arrangements/freeShow/missing kept reporting those shows as synced and
  // FreeShow never uploaded them again (FreeShow#3999).
  static async deleteSong(repos: Repos, churchId: string, songId: string) {
    const arrangements = await repos.arrangement.loadBySongId(churchId, songId);
    for (const arrangement of arrangements) await this.deleteArrangement(repos, churchId, arrangement.id);
    await repos.song.delete(churchId, songId);
  }
}
