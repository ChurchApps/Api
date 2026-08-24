import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { Song, SongView } from "../models/index.js";

// Spine fields are aliased back to the legacy song names the site consumes.
const SPINE_COLS = [
  "assets.id as id",
  "assets.name as title",
  "assets.tags as themes",
  "assets.language as language",
  "assets.license as license",
  "assets.status as status",
  "assets.thumbPath as artUrl",
  "assets.downloadCount as downloadCount",
  "assets.likeCount as likeCount",
  "assets.createdAt as createdAt"
] as const;

const MODERATION_SPINE_COLS = [...SPINE_COLS, "assets.publisherUserId as submittedBy"] as const;

// list payload omits chordPro (heavy) and moderation-only fields
const SUMMARY_SONG_COLS = [
  "songs.writer",
  "songs.year",
  "songs.songKey",
  "songs.bpm",
  "songs.timeSignature",
  "songs.scripture",
  "songs.hymnalCount",
  "songs.demoAudioUrl",
  "songs.demoAudioBytes",
  "songs.sheetPdfUrl",
  "songs.sheetPdfBytes",
  "songs.stemsZipUrl",
  "songs.stemsZipBytes",
  "songs.midiUrl",
  "songs.midiBytes",
  "songs.lyricsUrl",
  "songs.abcUrl",
  "songs.parentSongId",
  "songs.relationLabel",
  "songs.qualityScore"
] as const;

const SONG_COLS = [
  ...SUMMARY_SONG_COLS,
  "songs.assetId",
  "songs.scriptureText",
  "songs.chordPro",
  "songs.videoUrl",
  "songs.writerPortraitUrl",
  "songs.writerBio",
  "songs.certified",
  "songs.proAnswer",
  "songs.qualityDetail"
] as const;

const SUMMARY_COLS = [...SPINE_COLS, ...SUMMARY_SONG_COLS] as const;
const FULL_COLS = [...MODERATION_SPINE_COLS, ...SONG_COLS] as const;

@injectable()
export class SongRepo {
  public async loadApprovedSummaries(): Promise<SongView[]> {
    return await this.joined().select(SUMMARY_COLS).where("assets.status", "=", "approved")
      .orderBy("assets.downloadCount", "desc").orderBy("songs.hymnalCount", "desc").execute() as SongView[];
  }

  public async loadBySubmitter(submittedBy: string): Promise<SongView[]> {
    return await this.joined().select(SUMMARY_COLS).where("assets.publisherUserId", "=", submittedBy)
      .orderBy("assets.createdAt", "desc").execute() as SongView[];
  }

  public async loadLiked(userId: string): Promise<SongView[]> {
    return await this.joined().innerJoin("assetLikes", "assetLikes.assetId", "assets.id")
      .select(SUMMARY_COLS).where("assetLikes.userId", "=", userId).where("assets.status", "=", "approved")
      .orderBy("assetLikes.timeAdded", "desc").execute() as SongView[];
  }

  public async loadPending(): Promise<SongView[]> {
    return await this.joined().select(FULL_COLS).where("assets.status", "=", "pending")
      .orderBy(sql`songs.qualityScore is null`).orderBy("songs.qualityScore", "desc").orderBy("assets.createdAt", "asc").execute() as SongView[];
  }

  public async loadUnscored(limit: number): Promise<SongView[]> {
    return await this.joined().select(FULL_COLS)
      .where("songs.qualityScore", "is", null).where("assets.status", "!=", "removed").limit(limit).execute() as SongView[];
  }

  public async loadById(assetId: string): Promise<SongView | undefined> {
    return await this.joined().select(FULL_COLS).where("assets.id", "=", assetId).executeTakeFirst() as SongView | undefined;
  }

  public async create(song: Song): Promise<Song> {
    await getDb().insertInto("songs").values({
      assetId: song.assetId,
      writer: song.writer,
      year: song.year,
      songKey: song.songKey,
      bpm: song.bpm,
      timeSignature: song.timeSignature,
      scripture: song.scripture,
      scriptureText: song.scriptureText,
      hymnalCount: song.hymnalCount || 0,
      chordPro: song.chordPro,
      demoAudioUrl: song.demoAudioUrl,
      demoAudioBytes: song.demoAudioBytes,
      sheetPdfUrl: song.sheetPdfUrl,
      sheetPdfBytes: song.sheetPdfBytes,
      stemsZipUrl: song.stemsZipUrl,
      stemsZipBytes: song.stemsZipBytes,
      midiUrl: song.midiUrl,
      midiBytes: song.midiBytes,
      lyricsUrl: song.lyricsUrl,
      abcUrl: song.abcUrl,
      parentSongId: song.parentSongId,
      relationLabel: song.relationLabel,
      proAnswer: song.proAnswer,
      certified: song.certified,
      qualityScore: song.qualityScore,
      qualityDetail: song.qualityDetail
    } as any).execute();
    return song;
  }

  public async update(assetId: string, fields: Partial<Song>): Promise<void> {
    await getDb().updateTable("songs").set({ ...fields } as any).where("assetId", "=", assetId).execute();
  }

  private joined() {
    return getDb().selectFrom("assets").innerJoin("songs", "songs.assetId", "assets.id");
  }
}
