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
  /** exact license version the writer applied: "1.0" (WC), "4.0" | "3.0" (CC), "CC0" (PD dedication); null for historic PD */
  licenseVersion?: string;
  /** canonical URL of that exact license — a CC BY 3.0 song must not silently read as 4.0 */
  licenseUrl?: string;
  proAnswer?: string;
  certified?: boolean;
  qualityScore?: number;
  qualityDetail?: string;
  /** package confidence tier; "sunday-ready" is only ever set by the listen gate */
  confidence?: string;
  firstLine?: string;
  /** reserved (hymn tune name), null today */
  tune?: string;
  hasChords?: boolean;
  /** JSON RightsMap */
  rights?: string;
  /** JSON FormMap */
  form?: string;
  recommendedKey?: string;
  recommendedKeyReason?: string;
  /** JSON string[] */
  publishedKeys?: string;
  singTimeSeconds?: number;
  /** "master" | "abc" | "midi" — how the served score.musicxml was produced */
  scoreSource?: string;
  /** JSON string[] — the listen-gate record */
  listenedKeys?: string;
  sundayReadyBy?: string;
  sundayReadyAt?: Date;
}

export type Confidence = "sunday-ready" | "proofread-score" | "converted-from-abc" | "generated-from-midi" | "chart-only" | "lyrics-only";

export interface RightsLayer {
  license: string;
  basis?: string;
  source?: string;
  holder?: string;
  note?: string;
  review?: string;
}

export type RightsMap = Record<"text" | "translation" | "tune" | "arrangement" | "recording" | "artwork", RightsLayer | null>;

export type RightsUse = "project" | "print" | "stream" | "arrange" | "record";
export interface UseRule { allowed: boolean; conditions: string[]; }
export type RightsMatrix = Record<RightsUse, UseRule>;

export interface FormMap {
  status: "draft" | "approved";
  sections: { label: string; lyric: number }[];
  defaultOrder: string[];
}

export interface Contributor {
  name: string;
  what: string;
  submissionId?: string;
  at?: string;
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
  /** Opaque popularity/quality blend computed in SQL; the public song payloads sort on this instead of qualityScore. */
  rank?: number;
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
  featured?: boolean;
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
  /** add | replace | remove, or declined (partial approve) with the reviewer's reason */
  filesChanged?: { name: string; action: string; reason?: string }[];
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
