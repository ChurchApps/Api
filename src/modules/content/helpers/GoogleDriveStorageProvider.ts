import axios from "axios";
import path from "path";
import type { IStorageProvider, PresignedPostData } from "@churchapps/apihelper";
import { StorageProvider } from "../models/index.js";
import type { StorageProviderRepo } from "../repositories/StorageProviderRepo.js";
import { ByosAuth } from "./ByosAuth.js";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

// drive.file scope: only files/folders created by the app are visible, which is all we need.
// Files are identified by Drive file id (stored in files.externalId), not by path.
export class GoogleDriveStorageProvider implements IStorageProvider {
  public readonly name = "googledrive";

  constructor(private row: StorageProvider, private repo: StorageProviderRepo) {}

  private async token(): Promise<string> {
    const token = await ByosAuth.getAccessToken(this.repo, this.row);
    if (!token) throw new Error("Google Drive is not connected");
    return token;
  }

  private headers(token: string) {
    return { Authorization: "Bearer " + token };
  }

  private async ensureFolder(token: string): Promise<string> {
    const settings = JSON.parse(this.row.settings || "{}");
    if (settings.folderId) return settings.folderId;
    const resp = await axios.post(API + "/files", { name: "B1 Files", mimeType: "application/vnd.google-apps.folder" }, { headers: this.headers(token) });
    settings.folderId = resp.data.id;
    this.row.settings = JSON.stringify(settings);
    await this.repo.save(this.row);
    return settings.folderId;
  }

  private async makePublic(token: string, fileId: string): Promise<void> {
    await axios.post(API + "/files/" + fileId + "/permissions", { role: "reader", type: "anyone" }, { headers: this.headers(token) });
  }

  public async store(key: string, contentType: string, contents: Buffer): Promise<string> {
    const token = await this.token();
    const folderId = await this.ensureFolder(token);
    const boundary = "b1_" + Date.now().toString(36);
    const metadata = JSON.stringify({ name: path.basename(key), parents: [folderId] });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
      contents,
      Buffer.from(`\r\n--${boundary}--`)
    ]);
    const headers = { ...this.headers(token), "Content-Type": `multipart/related; boundary=${boundary}` };
    const resp = await axios.post(UPLOAD_API + "/files?uploadType=multipart", body, { headers, maxBodyLength: 60000000 });
    await this.makePublic(token, resp.data.id);
    return resp.data.id;
  }

  public async getUploadUrl(key: string, contentType: string, size: number): Promise<PresignedPostData | null> {
    const token = await this.token();
    const folderId = await this.ensureFolder(token);
    const headers = { ...this.headers(token), "X-Upload-Content-Type": contentType, "X-Upload-Content-Length": String(size) };
    const resp = await axios.post(UPLOAD_API + "/files?uploadType=resumable", { name: path.basename(key), parents: [folderId] }, { headers });
    const url = resp.headers.location || resp.headers.Location;
    if (!url) return null;
    return { url, fields: {}, key, method: "PUT", rawBody: true, externalIdField: "id" };
  }

  // key = the Drive file id (files.externalId), registered by the client after the resumable upload completes
  public async confirmUpload(key: string): Promise<void> {
    const token = await this.token();
    await this.makePublic(token, key);
  }

  public async remove(key: string): Promise<void> {
    const token = await this.token();
    try {
      await axios.delete(API + "/files/" + key, { headers: this.headers(token) });
    } catch (e: any) {
      if (e?.response?.status !== 404) throw e;
    }
  }

  public async list(_prefix: string): Promise<string[]> {
    return [];
  }

  public async move(oldKey: string, newKey: string): Promise<void> {
    throw new Error("move is not supported by the Google Drive storage provider (" + oldKey + " -> " + newKey + ")");
  }

  public async getDownloadUrl(key: string): Promise<string | null> {
    const token = await this.token();
    const resp = await axios.get(API + "/files/" + key + "?fields=webContentLink", { headers: this.headers(token) });
    return resp.data?.webContentLink || "https://drive.google.com/uc?export=download&id=" + key;
  }
}
