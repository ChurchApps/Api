import type { AbcSubmission, Asset, AssetDownload, AssetLike, LibrarySong, Report, Sing, Song } from "../models/index.js";

export interface CommonsDatabase {
  songs: Song;
  reports: Report;
  sings: Sing;
  libraries: LibrarySong;
  abcSubmissions: AbcSubmission;
  assets: Asset;
  assetLikes: AssetLike;
  assetDownloads: AssetDownload;
}
