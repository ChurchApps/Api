import type { Asset, AssetDownload, AssetFile, AssetPublisher, AssetRating, Author, Report, Song, Submission } from "../models/index.js";

export interface CommonsDatabase {
  songs: Song;
  authors: Author;
  reports: Report;
  assets: Asset;
  submissions: Submission;
  assetFiles: AssetFile;
  assetPublishers: AssetPublisher;
  assetRatings: AssetRating;
  assetDownloads: AssetDownload;
}
