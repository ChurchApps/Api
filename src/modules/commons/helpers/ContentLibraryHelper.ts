import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { FileStorageHelper } from "@churchapps/apihelper";
import { fileRole } from "@churchapps/helpers";
import { GetObjectCommand, PutObjectCommand, S3Client, S3ClientConfig } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { Environment } from "../../../shared/helpers/Environment.js";
import { AssetFile, SongView } from "../models/index.js";

// Storage keys are derived, never stored. Live objects sit under commons/assets/{assetType}/{assetId}/{name}
// (public); proposed objects under commons/pending/{submissionId}/{name}, which PublicFileAccess never
// serves and S3 keeps private. song.json / lyrics.chordpro conventions must match WorshipCommonsContent/tools/lib.mjs.

const ROOT = "commons";
const PENDING_ROOT = `${ROOT}/pending`;
const REVIEW_TTL_SEC = 7200;
const UPLOAD_TTL_SEC = 3600;
export const UPLOAD_FIELDS = ["demoAudio", "sheetPdf", "stemsZip"] as const;

export interface PresignedUpload { url: string; fields: Record<string, string>; method: "POST"; authRequired?: boolean; }

export class ContentLibraryHelper {
  private static s3: S3Client;

  static livePrefix(asset: { assetType?: string; id?: string }): string {
    return `${ROOT}/assets/${asset.assetType}/${asset.id}`;
  }

  static liveKey(asset: { assetType?: string; id?: string }, name: string): string {
    return `${this.livePrefix(asset)}/${name}`;
  }

  static pendingPrefix(submissionId: string): string {
    return `${PENDING_ROOT}/${submissionId}`;
  }

  static pendingKey(submissionId: string, name: string): string {
    return `${this.pendingPrefix(submissionId)}/${name}`;
  }

  static publicUrl(key: string): string {
    return `${(Environment.contentRoot || "").replace(/\/$/, "")}/${key}`;
  }

  /** role → public URL for an asset's live files (+ the author portrait for songs). */
  static fileUrls(asset: { assetType?: string; id?: string }, files: AssetFile[], portraitKey?: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of files) if (f.name) out[fileRole(f.name)] = this.publicUrl(this.liveKey(asset, f.name));
    if (portraitKey) out.portrait = this.publicUrl(portraitKey);
    return out;
  }

  // library-shaped song.json — what tools/build-catalog.mjs reads on export
  static songJson(song: SongView, files: AssetFile[]): object {
    const uploads: Record<string, string> = {};
    for (const f of files) {
      const role = fileRole(f.name || "");
      if ((UPLOAD_FIELDS as readonly string[]).includes(role)) uploads[role] = f.name || "";
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
      meter: song.meter,
      language: song.language,
      scripture: song.scripture,
      license: song.license,
      hymnalCount: song.hymnalCount ?? 0,
      status: "approved",
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

  static async store(key: string, contentType: string, contents: Buffer): Promise<void> {
    await FileStorageHelper.store(key, contentType, contents);
  }

  static async storePending(key: string, contentType: string, contents: Buffer): Promise<void> {
    if (Environment.fileStore === "S3") {
      await this.s3Client().send(new PutObjectCommand({ Bucket: Environment.s3Bucket, Key: key, Body: contents, ACL: "private", ContentType: contentType }));
      return;
    }
    await FileStorageHelper.store(key, contentType, contents);
  }

  /** Copies a pending object to its live key; overwrite-safe so an approve retry is harmless. */
  static async promote(fromKey: string, toKey: string): Promise<boolean> {
    const file = await this.readKey(fromKey);
    if (!file) return false;
    await FileStorageHelper.store(toKey, file.contentType, file.buffer);
    return true;
  }

  static async exists(key: string): Promise<boolean> {
    return !!(await this.readKey(key));
  }

  static async presignedUpload(submissionId: string, name: string, contentType: string, maxBytes: number, apiBase: string): Promise<PresignedUpload> {
    const key = this.pendingKey(submissionId, name);
    if (Environment.fileStore === "S3") {
      const { url, fields } = await createPresignedPost(this.s3Client(), {
        Bucket: Environment.s3Bucket,
        Key: key,
        Conditions: [["eq", "$Content-Type", contentType], ["content-length-range", 1, maxBytes]],
        Fields: { "Content-Type": contentType },
        Expires: UPLOAD_TTL_SEC
      });
      return { url, fields, method: "POST" };
    }
    return { url: `${apiBase.replace(/\/$/, "")}/commons/submissions/${submissionId}/upload/${encodeURIComponent(name)}`, fields: {}, method: "POST", authRequired: true };
  }

  static async signedPendingUrl(submissionId: string, name: string, apiBase: string): Promise<string> {
    const key = this.pendingKey(submissionId, name);
    if (Environment.fileStore === "S3") return await getSignedUrl(this.s3Client(), new GetObjectCommand({ Bucket: Environment.s3Bucket, Key: key }), { expiresIn: REVIEW_TTL_SEC });
    const exp = Math.floor(Date.now() / 1000) + REVIEW_TTL_SEC;
    return `${apiBase.replace(/\/$/, "")}/commons/admin/pending-files/${submissionId}/${encodeURIComponent(name)}?exp=${exp}&sig=${this.sign(submissionId, name, exp)}`;
  }

  static sign(submissionId: string, scope: string, exp: number): string {
    return crypto.createHmac("sha256", Environment.jwtSecret || "").update(`${submissionId}:${scope}:${exp}`).digest("hex");
  }

  static verify(submissionId: string, scope: string, exp: number, sig: string): boolean {
    if (!submissionId || !scope || !sig || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const a = Buffer.from(this.sign(submissionId, scope, exp));
    const b = Buffer.from(sig);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  // "{exp}.{sig}" — embedded in the product preview iframe URL the admin drawer opens
  static previewToken(submissionId: string): string {
    const exp = Math.floor(Date.now() / 1000) + REVIEW_TTL_SEC;
    return `${exp}.${this.sign(submissionId, "preview", exp)}`;
  }

  static verifyPreviewToken(submissionId: string, token: string): boolean {
    const [exp, sig] = String(token || "").split(".");
    return this.verify(submissionId, "preview", Number(exp), sig || "");
  }

  static async readPending(submissionId: string, name: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    return await this.readKey(this.pendingKey(submissionId, name));
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
    if (ext === "m4a") return "audio/mp4";
    if (ext === "ogg") return "audio/ogg";
    if (ext === "mp4") return "video/mp4";
    if (ext === "pdf") return "application/pdf";
    if (ext === "zip") return "application/zip";
    if (ext === "json") return "application/json";
    if (ext === "png") return "image/png";
    if (ext === "webp") return "image/webp";
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "mid" || ext === "midi") return "audio/midi";
    if (ext === "abc" || ext === "chordpro" || ext === "txt") return "text/plain; charset=utf-8";
    return "application/octet-stream";
  }

  static sha256(buffer: Buffer): string {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  static async readKey(key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
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

  static async removeKey(key: string): Promise<void> {
    try { await FileStorageHelper.remove(key); } catch { /* already gone */ }
  }

  static async removePrefix(prefix: string): Promise<void> {
    for (const key of await this.listKeys(prefix)) await this.removeKey(key);
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

  // disk listing returns bare file names; S3 returns full keys
  private static async listKeys(prefix: string): Promise<string[]> {
    const normalized = prefix.replace(/\/$/, "");
    try {
      const names = await FileStorageHelper.list(normalized);
      return names.filter(Boolean).map((n) => (n.includes("/") ? n : `${normalized}/${n}`));
    } catch { return []; }
  }
}
