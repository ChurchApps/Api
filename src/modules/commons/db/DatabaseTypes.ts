import type { Asset, AssetDownload, AssetFile, AssetPublisher, AssetRating, Author, Report, Song, Submission, SubmissionPayload } from "../models/index.js";

/** submissions as stored: the JSON columns are written as text and may read back as text or already parsed. */
export interface SubmissionRow extends Omit<Submission, "payload" | "filesChanged"> {
  payload?: SubmissionPayload | string;
  filesChanged?: Submission["filesChanged"] | string;
}

export interface CommonsDatabase {
  songs: Song;
  authors: Author;
  reports: Report;
  assets: Asset;
  submissions: SubmissionRow;
  assetFiles: AssetFile;
  assetPublishers: AssetPublisher;
  assetRatings: AssetRating;
  assetDownloads: AssetDownload;
}
