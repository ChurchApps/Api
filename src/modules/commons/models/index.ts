export interface Song {
  id?: string;
  title?: string;
  writer?: string;
  year?: number;
  themes?: string;
  songKey?: string;
  bpm?: number;
  timeSignature?: string;
  language?: string;
  scripture?: string;
  scriptureText?: string;
  license?: string;
  churchCount?: number;
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
  artUrl?: string;
  parentSongId?: string;
  relationLabel?: string;
  status?: string;
  submittedBy?: string;
  proAnswer?: string;
  certified?: boolean;
  qualityScore?: number;
  qualityDetail?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Generalized across content families: contentType is "song" or "asset".
export interface Report {
  id?: string;
  contentType?: string;
  contentId?: string;
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

export interface Sing {
  songId?: string;
  ipHash?: string;
  createdAt?: Date;
}

export interface LibrarySong {
  userId?: string;
  songId?: string;
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
