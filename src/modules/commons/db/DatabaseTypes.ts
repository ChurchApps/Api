import type { AbcSubmission, Asset, AssetDownload, AssetLike, Author, Report, Song } from "../models/index.js";

export interface CommonsDatabase {
  songs: Song;
  authors: Author;
  reports: Report;
  abcSubmissions: AbcSubmission;
  assets: Asset;
  assetLikes: AssetLike;
  assetDownloads: AssetDownload;
}
