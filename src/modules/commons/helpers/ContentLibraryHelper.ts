import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { FileStorageHelper } from "@churchapps/apihelper";
import { GetObjectCommand, PutObjectCommand, S3Client, S3ClientConfig } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Environment } from "../../../shared/helpers/Environment.js";
import { Asset, Song, SongView } from "../models/index.js";

// The commons library mirrors the WorshipCommonsContent repo layout, rooted under
// "commons/" so it can share the core Api content store. Approved songs get a
// library-shaped folder so a bucket→repo export (aws s3 sync) yields valid library
// folders and the DB row can be rebuilt from them. Conventions here (slugify,
// chordpro header) must match WorshipCommonsContent/tools/lib.mjs.

const ROOT = "commons";
const PENDING_ROOT = `${ROOT}/pending`;

const LANG_CODES: Record<string, string> = {
  English: "en",
  German: "de",
  Spanish: "es",
  Latin: "la",
  French: "fr",
  Portuguese: "pt",
  Russian: "ru",
  Malayalam: "ml",
  Albanian: "sq",
  Hungarian: "hu",
  Zulu: "zu"
};

const UPLOAD_COLS: [string, keyof Song][] = [["demoAudio", "demoAudioUrl"], ["sheetPdf", "sheetPdfUrl"], ["stemsZip", "stemsZipUrl"]];
const REVIEW_TTL_SEC = 7200;

export class ContentLibraryHelper {
  private static s3: S3Client;

  // matches lib.mjs slugify — cosmetic only, identity is the song id
  static slugify(title: string): string {
    return title.normalize("NFC").toLowerCase()
      .replace(/['’ʼ]/gu, "")
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "untitled";
  }

  // submissions get "<slug>--<id>" folders — unique without a bucket lookup.
  // ponytail: recomputed from the row (no stored path) — safe while titles are
  // immutable; a future edit endpoint must store the path or rename the folder.
  static folderKey(song: SongView): string {
    const lang = LANG_CODES[song.language || ""] || "en";
    const section = song.license === "PD" ? "public-domain" : "wc-license";
    return `${ROOT}/songs/${lang}/${section}/${this.slugify(song.title || "")}--${song.id}`;
  }

  static pendingFolderKey(song: SongView): string {
    return `${PENDING_ROOT}/${song.id}`;
  }

  static assetPendingFolderKey(assetId: string): string {
    return `${PENDING_ROOT}/assets/${assetId}`;
  }

  static assetFolderKey(asset: Asset): string {
    const typePath = (asset.assetType || "misc").split("/").map((seg) => this.slugify(seg)).join("/");
    return `${ROOT}/assets/${typePath}/${asset.id}`;
  }

  static publicUrl(key: string): string {
    return `${(Environment.contentRoot || "").replace(/\/$/, "")}/${key}`;
  }

  static storageKey(url?: string): string | undefined {
    if (!url) return undefined;
    if (url.startsWith(`${ROOT}/`)) return url;
    const root = (Environment.contentRoot || "").replace(/\/$/, "");
    if (root && url.startsWith(root + "/")) return url.slice(root.length + 1);
    return undefined;
  }

  static isPendingKey(key?: string): boolean {
    return !!key && key.startsWith(`${PENDING_ROOT}/`);
  }

  // library-shaped song.json — what tools/build-catalog.mjs reads on export
  static songJson(song: SongView): object {
    const uploads: Record<string, string> = {};
    for (const [field, urlCol] of UPLOAD_COLS) {
      const url = song[urlCol] as string | undefined;
      if (url) uploads[field] = url.split("/").pop() as string;
    }
    return {
      id: song.id,
      title: song.title,
      writer: song.writer,
      year: song.year,
      themes: song.themes,
      key: song.songKey,
      bpm: song.bpm,
      timeSignature: song.timeSignature,
      language: song.language,
      scripture: song.scripture,
      license: song.license,
      hymnalCount: song.hymnalCount ?? 0,
      status: song.status,
      submittedBy: song.submittedBy,
      proAnswer: song.proAnswer,
      certified: true,
      uploads: Object.keys(uploads).length ? uploads : undefined
    };
  }

  // matches lib.mjs renderChordpro — header must agree with song.json (validate.mjs checks)
  static renderChordpro(song: SongView): string {
    const lines: string[] = [];
    const d = (name: string, v: unknown) => { if (v !== null && v !== undefined && v !== "") lines.push(`{${name}: ${v}}`); };
    d("title", song.title);
    d("artist", song.writer);
    d("key", song.songKey);
    d("time", song.timeSignature);
    d("tempo", song.bpm);
    return lines.join("\n") + "\n\n" + song.chordPro + "\n";
  }

  static async writeSongFolder(song: SongView): Promise<void> {
    const folder = this.folderKey(song);
    await FileStorageHelper.store(`${folder}/song.json`, "application/json", Buffer.from(JSON.stringify(this.songJson(song), null, 2) + "\n"));
    await FileStorageHelper.store(`${folder}/lyrics.chordpro`, "text/plain; charset=utf-8", Buffer.from(this.renderChordpro(song)));
  }

  // Pending files live under commons/pending, which PublicFileAccess never serves and S3 keeps private.
  static async storePending(key: string, contentType: string, contents: Buffer): Promise<void> {
    if (Environment.fileStore === "S3") {
      await this.s3Client().send(new PutObjectCommand({ Bucket: Environment.s3Bucket, Key: key, Body: contents, ACL: "private", ContentType: contentType }));
      return;
    }
    await FileStorageHelper.store(key, contentType, contents);
  }

  static async publishSong(song: SongView): Promise<Partial<Song>> {
    const updates: Partial<Song> = {};
    const folder = this.folderKey(song);
    for (const [, urlCol] of UPLOAD_COLS) {
      const key = this.storageKey(song[urlCol] as string | undefined);
      if (!this.isPendingKey(key)) continue;
      const file = await this.readKey(key);
      if (!file) continue;
      const dest = `${folder}/${key.split("/").pop()}`;
      await FileStorageHelper.store(dest, file.contentType, file.buffer);
      await this.removeKey(key);
      (updates as any)[urlCol] = this.publicUrl(dest);
    }
    await this.writeSongFolder({ ...song, ...updates });
    await this.removePrefix(this.pendingFolderKey(song));
    return updates;
  }

  static async removeSongObjects(song: SongView): Promise<void> {
    await this.removePrefix(this.pendingFolderKey(song));
    await this.removePrefix(this.folderKey(song));
    for (const [, urlCol] of UPLOAD_COLS) {
      const key = this.storageKey(song[urlCol] as string | undefined);
      if (key) await this.removeKey(key);
    }
  }

  /** Moves an approved asset's pending files into its public folder and returns the new paths. */
  static async publishAsset(asset: Asset): Promise<Partial<Asset>> {
    const folder = this.assetFolderKey(asset);
    const updates: Partial<Asset> = {};
    for (const col of ["contentPath", "thumbPath"] as (keyof Asset)[]) {
      const key = this.storageKey(asset[col] as string | undefined);
      if (!this.isPendingKey(key)) continue;
      const file = await this.readKey(key);
      if (!file) continue;
      const dest = `${folder}/${key.split("/").pop()}`;
      await FileStorageHelper.store(dest, file.contentType, file.buffer);
      await this.removeKey(key);
      (updates as any)[col] = this.publicUrl(dest);
    }
    await this.removePrefix(this.assetPendingFolderKey(asset.id || ""));
    return updates;
  }

  static async removeAssetObjects(asset: Asset): Promise<void> {
    await this.removePrefix(this.assetPendingFolderKey(asset.id || ""));
    await this.removePrefix(this.assetFolderKey(asset));
    for (const col of ["contentPath", "thumbPath"] as (keyof Asset)[]) {
      const key = this.storageKey(asset[col] as string | undefined);
      if (key) await this.removeKey(key);
    }
  }

  static async withReviewUrls(song: SongView, apiBase: string): Promise<SongView> {
    const exp = Math.floor(Date.now() / 1000) + REVIEW_TTL_SEC;
    const out = { ...song };
    for (const [field, urlCol] of UPLOAD_COLS) {
      const key = this.storageKey(song[urlCol] as string | undefined);
      if (!this.isPendingKey(key) || !song.id) continue;
      if (Environment.fileStore === "S3") (out as any)[urlCol] = await getSignedUrl(this.s3Client(), new GetObjectCommand({ Bucket: Environment.s3Bucket, Key: key }), { expiresIn: REVIEW_TTL_SEC });
      else (out as any)[urlCol] = `${apiBase.replace(/\/$/, "")}/commons/admin/pending-files/${song.id}/${field}?exp=${exp}&sig=${this.signPendingFile(song.id, field, exp)}`;
    }
    return out;
  }

  static signPendingFile(songId: string, field: string, exp: number): string {
    return crypto.createHmac("sha256", Environment.jwtSecret || "").update(`${songId}:${field}:${exp}`).digest("hex");
  }

  static verifyPendingFile(songId: string, field: string, exp: number, sig: string): boolean {
    if (!songId || !field || !sig || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const expected = this.signPendingFile(songId, field, exp);
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  static async readPendingField(song: SongView, field: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const col = UPLOAD_COLS.find(([f]) => f === field)?.[1];
    if (!col) return null;
    const key = this.storageKey(song[col] as string | undefined);
    if (!this.isPendingKey(key)) return null;
    return await this.readKey(key);
  }

  static requestApiBase(req: { protocol?: string; get?: (n: string) => string | undefined; headers: Record<string, unknown> }): string {
    const xfProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const xfHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
    return `${xfProto || req.protocol || "https"}://${xfHost || req.get?.("host") || ""}`;
  }

  static contentTypeFor(name: string): string {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "mp3") return "audio/mpeg";
    if (ext === "wav") return "audio/wav";
    if (ext === "pdf") return "application/pdf";
    if (ext === "zip") return "application/zip";
    if (ext === "json") return "application/json";
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    return "application/octet-stream";
  }

  private static s3Client(): S3Client {
    if (!this.s3) {
      const config: S3ClientConfig = {};
      if (process.env.S3_ENDPOINT) {
        config.endpoint = process.env.S3_ENDPOINT;
        config.forcePathStyle = true;
      }
      this.s3 = new S3Client(config);
    }
    return this.s3;
  }

  private static async readKey(key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (Environment.fileStore === "S3") {
      try {
        const res = await this.s3Client().send(new GetObjectCommand({ Bucket: Environment.s3Bucket, Key: key }));
        const bytes = await res.Body?.transformToByteArray();
        if (!bytes) return null;
        return { buffer: Buffer.from(bytes), contentType: res.ContentType || this.contentTypeFor(key) };
      } catch { return null; }
    }
    const fileName = path.resolve("content", key);
    if (!fs.existsSync(fileName)) return null;
    return { buffer: fs.readFileSync(fileName), contentType: this.contentTypeFor(key) };
  }

  private static async removeKey(key: string): Promise<void> {
    try { await FileStorageHelper.remove(key); } catch { /* already gone */ }
  }

  private static async removePrefix(prefix: string): Promise<void> {
    for (const key of await this.listKeys(prefix)) await this.removeKey(key);
  }

  // disk listing returns bare file names; S3 returns full keys
  private static async listKeys(prefix: string): Promise<string[]> {
    const normalized = prefix.replace(/\/$/, "");
    try {
      const names = await FileStorageHelper.list(normalized);
      return names.filter(Boolean).map((n) => (n.includes("/") ? n : `${normalized}/${n}`));
    } catch { return []; }
  }
}
