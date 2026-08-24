import type { Asset, AssetDownload, AssetFile, AssetRating, Author, Report, Song, Submission } from "../models/index.js";

export interface CommonsDatabase {
  songs: Song;
  authors: Author;
  reports: Report;
  assets: Asset;
  submissions: Submission;
  assetFiles: AssetFile;
  assetRatings: AssetRating;
  assetDownloads: AssetDownload;
}
