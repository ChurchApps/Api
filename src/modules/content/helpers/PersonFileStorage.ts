import crypto from "crypto";
import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { EnvironmentBase, StorageProviderFactory, resolveMaxUploadBytes } from "@churchapps/apihelper";
import { Environment } from "../../../shared/helpers/index.js";

export const PERSON_CONTENT_TYPE = "person";
export const PERSON_LINK_CATEGORY = "personLink";
export const PERSON_MAX_TOTAL_BYTES = 100000000;
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const LINK_TTL_SECONDS = 300;

// Person documents (baptism certificates, background checks) are staff-only records. They always live on
// the default store - never a church's BYOS provider, whose links are shared publicly - and never public-read:
// S3 objects get no ACL and the disk path is outside the publicly served folders (see PublicFileAccess).
// Downloads go through a short-lived signed link minted for staff with View People.
export class PersonFileStorage {
  static isValidPersonId(id: string | undefined): boolean {
    return SAFE_ID.test(id || "");
  }

  static async store(key: string, contentType: string, contents: Buffer): Promise<void> {
    if (EnvironmentBase.fileStore === "S3") {
      await this.s3().send(new PutObjectCommand({ Bucket: EnvironmentBase.s3Bucket, Key: this.objectKey(key), Body: contents, ContentType: contentType }));
    } else {
      await StorageProviderFactory.getDefault().store(key, contentType, contents);
    }
  }

  static async getUploadUrl(key: string, contentType: string, size: number): Promise<{ url: string; fields: Record<string, string>; key: string } | null> {
    if (EnvironmentBase.fileStore !== "S3") return null;
    const objectKey = this.objectKey(key);
    const { url, fields } = await createPresignedPost(this.s3(), {
      Bucket: EnvironmentBase.s3Bucket,
      Key: objectKey,
      Fields: { "Content-Type": contentType },
      Conditions: [["eq", "$Content-Type", contentType], ["content-length-range", 1, resolveMaxUploadBytes(size)]],
      Expires: 3600
    });
    return { url, fields, key: objectKey };
  }

  static async remove(key: string): Promise<void> {
    try {
      await StorageProviderFactory.getDefault().remove(key);
    } catch {
      // already gone
    }
  }

  static signLink(fileId: string, nowMs = Date.now()): string {
    const exp = Math.floor(nowMs / 1000) + LINK_TTL_SECONDS;
    return Environment.contentApi + "/files/download/" + fileId + "?exp=" + exp + "&sig=" + this.signature(fileId, exp);
  }

  static verifyLink(fileId: string, exp: string | undefined, sig: string | undefined): boolean {
    const expNum = Number(exp);
    if (!Environment.jwtSecret || !Number.isFinite(expNum) || expNum < Date.now() / 1000 || !sig) return false;
    const expected = Buffer.from(this.signature(fileId, expNum));
    const actual = Buffer.from(sig);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  }

  static async s3DownloadUrl(key: string, fileName: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: EnvironmentBase.s3Bucket, Key: this.objectKey(key), ResponseContentDisposition: this.contentDisposition(fileName) });
    return getSignedUrl(this.s3(), command, { expiresIn: 60 });
  }

  static readLocal(key: string): Buffer | null {
    const root = path.resolve("./content") + path.sep;
    if (!key || key.split(/[/\\]+/).includes("..")) return null;
    const fullPath = path.resolve(root, key.replace(/^[/\\]+/, ""));
    if (!fullPath.startsWith(root) || !fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath);
  }

  static contentDisposition(fileName: string): string {
    const name = (fileName || "document").replace(/[\r\n"\\]/g, "");
    const ascii = name.replace(/[^\x20-\x7e]/g, "_");
    return "attachment; filename=\"" + ascii + "\"; filename*=UTF-8''" + encodeURIComponent(name);
  }

  private static signature(fileId: string, exp: number): string {
    return crypto.createHmac("sha256", Environment.jwtSecret).update("personFile:" + fileId + ":" + exp).digest("hex");
  }

  private static objectKey(key: string): string {
    return key.replace(/^\//, "");
  }

  private static s3(): S3Client {
    const config = process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {};
    return new S3Client(config);
  }
}
