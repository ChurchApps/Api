import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { Song, SongView } from "../models/index.js";

// Spine and author fields are aliased back to the legacy song names the site consumes.
const SPINE_COLS = [
  "assets.id as id",
  "assets.name as title",
  "assets.tags as themes",
  "assets.language as language",
  "assets.license as license",
  "assets.status as status",
  "assets.featured as featured",
  "assets.downloadCount as downloadCount",
  "assets.ratingCount as ratingCount",
  "assets.ratingSum as ratingSum",
  "assets.createdAt as createdAt",
  "assets.publishedAt as publishedAt"
] as const;

const MODERATION_SPINE_COLS = [...SPINE_COLS, "assets.publisherUserId as submittedBy"] as const;

const AUTHOR_COLS = [
  "authors.name as writer",
  "authors.bio as writerBio",
  "authors.portraitUrl as portraitKey"
] as const;

// list payload omits chordPro (heavy) and moderation-only fields
const SUMMARY_SONG_COLS = [
  "songs.year",
  "songs.songKey",
  "songs.bpm",
  "songs.timeSignature",
  "songs.meter",
  "songs.scripture",
  "songs.hymnalCount",
  "songs.parentSongId",
  "songs.relationLabel",
  "songs.licenseVersion",
  "songs.licenseUrl",
  "songs.confidence",
  "songs.firstLine",
  "songs.tune",
  "songs.hasChords",
  "songs.recommendedKey",
  "songs.singTimeSeconds"
] as const;

// Popularity dominates, moderation quality is a kicker; unscored songs sit at a neutral 50.
// Rounded to an opaque integer so the reviewer-only qualityScore cannot be read back out of it.
const RANK_COL = sql<number>`cast(round(assets.downloadCount / greatest(1, (select max(maxDl.downloadCount) from assets maxDl where maxDl.status = 'published')) * 60 + coalesce(songs.qualityScore, 50) / 100 * 40) as signed)`.as("rank");

const SONG_COLS = [
  ...SUMMARY_SONG_COLS,
  "songs.assetId",
  "songs.authorId",
  "songs.scriptureText",
  "songs.chordPro",
  "songs.videoUrl",
  "songs.certified",
  "songs.proAnswer",
  "songs.qualityScore",
  "songs.qualityDetail",
  "songs.rights",
  "songs.form",
  "songs.recommendedKeyReason",
  "songs.publishedKeys",
  "songs.scoreSource",
  "songs.listenedKeys",
  "songs.sundayReadyBy",
  "songs.sundayReadyAt",
  "songs.contributors"
] as const;

const SUMMARY_COLS = [...SPINE_COLS, ...AUTHOR_COLS, ...SUMMARY_SONG_COLS, RANK_COL];
const FULL_COLS = [...MODERATION_SPINE_COLS, ...AUTHOR_COLS, ...SONG_COLS, RANK_COL];

const PACKAGE_COLS = [
  "confidence",
  "firstLine",
  "tune",
  "hasChords",
  "rights",
  "form",
  "recommendedKey",
  "recommendedKeyReason",
  "publishedKeys",
  "singTimeSeconds",
  "scoreSource",
  "listenedKeys",
  "sundayReadyBy",
  "sundayReadyAt"
] as const;

export interface SongFilters {
  /** only Sunday-ready packages (B1Admin and FreeShow pull with this) */
  sundayReady?: boolean;
  confidence?: string;
  language?: string;
  /** case-insensitive substring of title, first line or writer */
  q?: string;
}

@injectable()
export class SongRepo {
  public async loadPublishedSummaries(filters: SongFilters = {}): Promise<SongView[]> {
    let q = this.joined().select(SUMMARY_COLS).where("assets.status", "=", "published");
    if (filters.sundayReady) q = q.where("songs.confidence", "=", "sunday-ready");
    else if (filters.confidence) q = q.where("songs.confidence", "=", filters.confidence);
    if (filters.language) q = q.where("assets.language", "=", filters.language);
    if (filters.q) {
      const like = `%${filters.q.toLowerCase()}%`;
      q = q.where((eb) => eb.or([eb(sql`lower(assets.name)`, "like", like), eb(sql`lower(songs.firstLine)`, "like", like), eb(sql`lower(authors.name)`, "like", like)]));
    }
    return await q.orderBy(sql.ref("rank"), "desc").orderBy("assets.downloadCount", "desc").orderBy("songs.hymnalCount", "desc").execute() as SongView[];
  }

  /** The root song and every song pointing at it — the /page family, in catalog (rank) order. */
  public async loadFamily(rootId: string): Promise<SongView[]> {
    return await this.joined().select(SUMMARY_COLS).where("assets.status", "=", "published")
      .where((eb) => eb.or([eb("assets.id", "=", rootId), eb("songs.parentSongId", "=", rootId)]))
      .orderBy(sql.ref("rank"), "desc").orderBy("assets.downloadCount", "desc").orderBy("songs.hymnalCount", "desc").execute() as SongView[];
  }

  /** id/title/writer plus enough of chordPro to read its first line — the duplicate check's whole corpus. */
  public async loadPublishedForDuplicates(): Promise<SongView[]> {
    return await this.joined()
      .select(["assets.id as id", "assets.name as title", "authors.name as writer", sql<string>`substring(songs.chordPro, 1, 500)`.as("chordPro")])
      .where("assets.status", "=", "published").execute() as SongView[];
  }

  public async loadPublishedByAuthor(authorId: string): Promise<SongView[]> {
    return await this.joined().select(SUMMARY_COLS).where("songs.authorId", "=", authorId).where("assets.status", "=", "published")
      .orderBy("assets.publishedAt", "desc").orderBy("assets.name", "asc").execute() as SongView[];
  }

  public async loadBySubmitter(submittedBy: string): Promise<SongView[]> {
    return await this.joined().select(SUMMARY_COLS).where("assets.publisherUserId", "=", submittedBy)
      .orderBy("assets.createdAt", "desc").execute() as SongView[];
  }

  public async loadSaved(userId: string): Promise<SongView[]> {
    return await this.joined().innerJoin("assetRatings", "assetRatings.assetId", "assets.id")
      .select(SUMMARY_COLS).where("assetRatings.userId", "=", userId).where("assetRatings.saved", "=", true as any).where("assets.status", "=", "published")
      .orderBy("assetRatings.modifiedAt", "desc").execute() as SongView[];
  }

  public async loadUnscored(limit: number): Promise<SongView[]> {
    return await this.joined().select(FULL_COLS)
      .where("songs.qualityScore", "is", null).where("assets.status", "!=", "removed").limit(limit).execute() as SongView[];
  }

  public async loadById(assetId: string): Promise<SongView | undefined> {
    return await this.joined().select(FULL_COLS).where("assets.id", "=", assetId).executeTakeFirst() as SongView | undefined;
  }

  public async loadSatellite(assetId: string): Promise<Song | undefined> {
    return await getDb().selectFrom("songs").selectAll().where("assetId", "=", assetId).executeTakeFirst() as Song | undefined;
  }

  public async upsert(song: Song): Promise<void> {
    const existing = await this.loadSatellite(song.assetId || "");
    if (existing) { await this.update(song.assetId || "", song); return; }
    const row: Record<string, unknown> = {
      assetId: song.assetId,
      authorId: song.authorId,
      year: song.year,
      songKey: song.songKey,
      bpm: song.bpm,
      timeSignature: song.timeSignature,
      meter: song.meter,
      scripture: song.scripture,
      scriptureText: song.scriptureText,
      hymnalCount: song.hymnalCount || 0,
      chordPro: song.chordPro,
      videoUrl: song.videoUrl,
      parentSongId: song.parentSongId,
      relationLabel: song.relationLabel,
      licenseVersion: song.licenseVersion,
      licenseUrl: song.licenseUrl,
      proAnswer: song.proAnswer,
      certified: song.certified,
      qualityScore: song.qualityScore,
      qualityDetail: song.qualityDetail,
      contributors: song.contributors
    };
    for (const c of PACKAGE_COLS) if (song[c] !== undefined) row[c] = song[c];
    await getDb().insertInto("songs").values(row as any).execute();
  }

  public async update(assetId: string, fields: Partial<Song>): Promise<void> {
    await getDb().updateTable("songs").set({ ...fields } as any).where("assetId", "=", assetId).execute();
  }

  private joined() {
    return getDb().selectFrom("assets").innerJoin("songs", "songs.assetId", "assets.id")
      .leftJoin("authors", "authors.id", "songs.authorId");
  }
}
