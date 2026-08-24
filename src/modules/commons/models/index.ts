/** songs satellite row — the spine (title, themes, language, license, status, publisher, counters) lives on the asset. */
export interface Song {
  assetId?: string;
  writer?: string;
  year?: number;
  songKey?: string;
  bpm?: number;
  timeSignature?: string;
  scripture?: string;
  scriptureText?: string;
  hymnalCount?: number;
  chordPro?: string;
  demoAudioUrl?: string;
  demoAudioBytes?: number;
  sheetPdfUrl?: string;
  sheetPdfBytes?: number;
  stemsZipUrl?: string;
  stemsZipBytes?: number;
  midiUrl?: string;
  midiBytes?: number;
  lyricsUrl?: string;
  abcUrl?: string;
  videoUrl?: string;
  writerPortraitUrl?: string;
  writerBio?: string;
  parentSongId?: string;
  relationLabel?: string;
  proAnswer?: string;
  certified?: boolean;
  qualityScore?: number;
  qualityDetail?: string;
}

/** Satellite joined to its asset, aliased back to the legacy song field names the site consumes. */
export interface SongView extends Song {
  id?: string;
  title?: string;
  themes?: string;
  language?: string;
  license?: string;
  status?: string;
  submittedBy?: string;
  artUrl?: string;
  downloadCount?: number;
  likeCount?: number;
  createdAt?: Date;
}

export interface Report {
  id?: string;
  assetId?: string;
  contentText?: string;
  reporterRole?: string;
  details?: string;
  name?: string;
  email?: string;
  signature?: string;
  status?: string;
  createdAt?: Date;
}

export interface AbcSubmission {
  id?: string;
  songId?: string;
  abc?: string;
  submittedBy?: string;
  status?: string;
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
  contentPath?: string;
  thumbPath?: string;
  sizeBytes?: number;
  contentHash?: string;
  version?: string;
  appMinVersion?: string;
  downloadCount?: number;
  likeCount?: number;
  featured?: boolean;
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt?: Date;
  modifiedAt?: Date;
}

export interface AssetLike {
  id?: string;
  assetId?: string;
  userId?: string;
  timeAdded?: Date;
}

export interface AssetDownload {
  assetId?: string;
  ipHash?: string;
  createdAt?: Date;
}
