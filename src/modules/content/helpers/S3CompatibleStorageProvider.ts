import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { EncryptionHelper } from "@churchapps/apihelper";
import type { IStorageProvider, PresignedPostData } from "@churchapps/apihelper";
import { StorageProvider } from "../models/index.js";

interface S3Settings {
  endpoint?: string;
  region?: string;
  bucket?: string;
  publicBase?: string;
}

// Church-owned S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2). Presigned PUT,
// not POST — B2 has no POST-policy support. The bucket must allow public read and CORS PUT;
// public URLs are stable (publicBase + key), so no download redirect is needed.
export class S3CompatibleStorageProvider implements IStorageProvider {
  public readonly name = "s3";
  private settings: S3Settings;
  private client: S3Client;

  constructor(private row: StorageProvider) {
    this.settings = JSON.parse(row.settings || "{}");
    const credentials = { accessKeyId: row.apiKey || "", secretAccessKey: row.apiSecret ? EncryptionHelper.decrypt(row.apiSecret) : "" };
    const config: any = { region: this.settings.region || "auto", credentials };
    if (this.settings.endpoint) {
      config.endpoint = this.settings.endpoint;
      config.forcePathStyle = true;
    }
    this.client = new S3Client(config);
  }

  private objectKey(key: string): string {
    return key.replace(/^\//, "");
  }

  public publicUrl(key: string): string {
    return (this.settings.publicBase || "").replace(/\/$/, "") + "/" + this.objectKey(key);
  }

  public async store(key: string, contentType: string, contents: Buffer): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.settings.bucket, Key: this.objectKey(key), Body: contents, ContentType: contentType });
    await this.client.send(command);
    return this.objectKey(key);
  }

  public async getUploadUrl(key: string, contentType: string, _size: number): Promise<PresignedPostData | null> {
    const command = new PutObjectCommand({ Bucket: this.settings.bucket, Key: this.objectKey(key), ContentType: contentType });
    const url = await getSignedUrl(this.client, command, { expiresIn: 3600 });
    return { url, fields: {}, key, method: "PUT", rawBody: true, headers: { "Content-Type": contentType } };
  }

  public async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.settings.bucket, Key: this.objectKey(key) }));
  }

  public async list(_prefix: string): Promise<string[]> {
    return [];
  }

  public async move(oldKey: string, newKey: string): Promise<void> {
    throw new Error("move is not supported by the S3-compatible storage provider (" + oldKey + " -> " + newKey + ")");
  }

  public async getDownloadUrl(key: string): Promise<string | null> {
    return this.publicUrl(key);
  }
}
