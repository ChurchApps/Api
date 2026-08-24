import type { AbcSubmission, Asset, AssetDownload, AssetLike, Report, Song } from "../models/index.js";

export interface CommonsDatabase {
  songs: Song;
  reports: Report;
  abcSubmissions: AbcSubmission;
  assets: Asset;
  assetLikes: AssetLike;
  assetDownloads: AssetDownload;
}
