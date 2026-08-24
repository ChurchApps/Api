import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { FileStorageHelper } from "@churchapps/apihelper";
import { GetObjectCommand, PutObjectCommand, S3Client, S3ClientConfig } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Environment } from "../../../shared/helpers/Environment.js";
import { Asset, SongView } from "../models/index.js";

// The commons library mirrors the WorshipCommonsContent repo layout, rooted under
// "commons/" so it can share the core Api content store. Approved songs get a
// library-shaped folder so a bucket→repo export (aws s3 sync) yields valid library
// folders and the DB row can be rebuilt from them. Conventions here (slugify,
// chordpro header, file names) must match WorshipCommonsContent/tools/lib.mjs.

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

// content-repo names whose media key is not just basename-minus-extension
const FILE_KEYS: Record<string, string> = { "tune.mid": "midi", "tune.abc": "abc", "timing.json": "timing" };
export const UPLOAD_FIELDS = ["demoAudio", "sheetPdf", "stemsZip"] as const;
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
  // used only as the publish target; the row's stored path is the source of truth after.
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

  static isPendingKey(key?: string): boolean {
    return !!key && key.startsWith(`${PENDING_ROOT}/`);
  }

  static fileKey(name: string): string {
    return FILE_KEYS[name] || name.replace(/\.[^.]+$/, "");
  }

  static fileList(item: { files?: string }): string[] {
    return (item.files || "").split(",").map((f) => f.trim()).filter(Boolean);
  }

  static fileUrls(item: { path?: string; files?: string; portraitKey?: string }): Record<string, string> {
    const out: Record<string, string> = {};
    if (item.path) for (const name of this.fileList(item)) out[this.fileKey(name)] = this.publicUrl(`${item.path}/${name}`);
    if (item.portraitKey) out.portrait = this.publicUrl(item.portraitKey);
    return out;
  }

  static withUrls<T extends { path?: string; files?: string; portraitKey?: string }>(item: T): Omit<T, "portraitKey"> & { fileUrls: Record<string, string> } {
    const { portraitKey: _portraitKey, ...rest } = item;
    return { ...rest, fileUrls: this.fileUrls(item) };
  }

  // library-shaped song.json — what tools/build-catalog.mjs reads on export
  static songJson(song: SongView): object {
    const uploads: Record<string, string> = {};
    for (const name of this.fileList(song)) {
      const key = this.fileKey(name);
      if ((UPLOAD_FIELDS as readonly string[]).includes(key)) uploads[key] = name;
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

  static async writeSongFolder(song: SongView, folder: string): Promise<void> {
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

  static async publishSong(song: SongView): Promise<Partial<Asset>> {
    const folder = this.folderKey(song);
    if (this.isPendingKey(song.path)) {
      for (const name of this.fileList(song)) {
        const file = await this.readKey(`${song.path}/${name}`);
        if (!file) continue;
        await FileStorageHelper.store(`${folder}/${name}`, file.contentType, file.buffer);
      }
    }
    await this.writeSongFolder(song, folder);
    await this.removePrefix(this.pendingFolderKey(song));
    return { path: folder };
  }

  static async removeSongObjects(song: SongView): Promise<void> {
    await this.removePrefix(this.pendingFolderKey(song));
    if (song.path) await this.removePrefix(song.path);
  }

  /** Moves an approved asset's pending files into its public folder and returns the new path. */
  static async publishAsset(asset: Asset): Promise<Partial<Asset>> {
    const folder = this.assetFolderKey(asset);
    if (this.isPendingKey(asset.path)) {
      for (const name of this.fileList(asset)) {
        const file = await this.readKey(`${asset.path}/${name}`);
        if (!file) continue;
        await FileStorageHelper.store(`${folder}/${name}`, file.contentType, file.buffer);
      }
    }
    await this.removePrefix(this.assetPendingFolderKey(asset.id || ""));
    return { path: folder };
  }

  static async removeAssetObjects(asset: Asset): Promise<void> {
    await this.removePrefix(this.assetPendingFolderKey(asset.id || ""));
    if (asset.path) await this.removePrefix(asset.path);
  }

  static async withReviewUrls(song: SongView, apiBase: string): Promise<SongView> {
    if (!this.isPendingKey(song.path) || !song.id) return this.withUrls(song);
    const exp = Math.floor(Date.now() / 1000) + REVIEW_TTL_SEC;
    const fileUrls: Record<string, string> = {};
    for (const name of this.fileList(song)) {
      const field = this.fileKey(name);
      if (Environment.fileStore === "S3") fileUrls[field] = await getSignedUrl(this.s3Client(), new GetObjectCommand({ Bucket: Environment.s3Bucket, Key: `${song.path}/${name}` }), { expiresIn: REVIEW_TTL_SEC });
      else fileUrls[field] = `${apiBase.replace(/\/$/, "")}/commons/admin/pending-files/${song.id}/${field}?exp=${exp}&sig=${this.signPendingFile(song.id, field, exp)}`;
    }
    const { portraitKey: _portraitKey, ...rest } = song;
    return { ...rest, fileUrls };
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
    if (!this.isPendingKey(song.path)) return null;
    const name = this.fileList(song).find((n) => this.fileKey(n) === field);
    if (!name) return null;
    return await this.readKey(`${song.path}/${name}`);
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
