/** songs satellite row — the spine (name, tags, language, license, status, publisher, counters) lives on the asset. */
export interface Song {
  assetId?: string;
  authorId?: string;
  year?: number;
  songKey?: string;
  bpm?: number;
  timeSignature?: string;
  meter?: string;
  scripture?: string;
  scriptureText?: string;
  hymnalCount?: number;
  chordPro?: string;
  videoUrl?: string;
  parentSongId?: string;
  relationLabel?: string;
  proAnswer?: string;
  certified?: boolean;
  qualityScore?: number;
  qualityDetail?: string;
}

export interface AuthorLink {
  label?: string;
  url?: string;
}

export interface Author {
  id?: string;
  name?: string;
  bio?: string;
  portraitUrl?: string;
  userId?: string;
  links?: string;
  createdAt?: Date;
}

/** Satellite joined to its asset and author, aliased back to the legacy song field names the site consumes. */
export interface SongView extends Song {
  id?: string;
  title?: string;
  themes?: string;
  language?: string;
  license?: string;
  status?: string;
  submittedBy?: string;
  writer?: string;
  writerBio?: string;
  portraitKey?: string;
  fileUrls?: Record<string, string>;
  downloadCount?: number;
  ratingCount?: number;
  ratingSum?: number;
  createdAt?: Date;
  publishedAt?: Date;
}

export interface Report {
  id?: string;
  assetId?: string;
  contentText?: string;
  reason?: string;
  reporterUserId?: string;
  reporterRole?: string;
  details?: string;
  name?: string;
  email?: string;
  signature?: string;
  status?: string;
  resolution?: string;
  resolutionNote?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt?: Date;
}

export interface Asset {
  id?: string;
  assetType?: string;
  name?: string;
  description?: string;
  tags?: string;
  language?: string;
  license?: string;
  publisherUserId?: string;
  publisherChurchId?: string;
  status?: string;
  publishedSubmissionId?: string;
  featured?: boolean;
  downloadCount?: number;
  ratingCount?: number;
  ratingSum?: number;
  removedReason?: string;
  unpublishedAt?: Date;
  createdAt?: Date;
  modifiedAt?: Date;
  publishedAt?: Date;
}

export interface Submission {
  id?: string;
  assetId?: string;
  submittedBy?: string;
  status?: string;
  payload?: SubmissionPayload;
  note?: string;
  triageScore?: number;
  filesChanged?: { name: string; action: string }[];
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewReason?: string;
  reviewNote?: string;
  createdAt?: Date;
  submittedAt?: Date;
}

export interface SubmissionPayload {
  name?: string;
  description?: string;
  tags?: string;
  language?: string;
  license?: string;
  licenseVersion?: string;
  attestationVersion?: string;
  attestedAt?: string;
  publisherChurchId?: string;
  detail?: Record<string, any>;
  qualityDetail?: any;
}

export interface AssetFile {
  id?: string;
  assetId?: string;
  submissionId?: string | null;
  name?: string;
  action?: string;
  sizeBytes?: number;
  contentHash?: string;
  uploadedBy?: string;
  createdAt?: Date;
}

export interface AssetRating {
  assetId?: string;
  userId?: string;
  stars?: number | null;
  saved?: boolean;
  createdAt?: Date;
  modifiedAt?: Date;
}

export interface AssetDownload {
  assetId?: string;
  ipHash?: string;
  ymd?: string;
  createdAt?: Date;
}
