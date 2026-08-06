import axios from "axios";
import type { IStorageProvider, PresignedPostData } from "@churchapps/apihelper";
import { StorageProvider } from "../models/index.js";
import type { StorageProviderRepo } from "../repositories/StorageProviderRepo.js";
import { ByosAuth } from "./ByosAuth.js";

const API = "https://api.dropboxapi.com/2";
const CONTENT_API = "https://content.dropboxapi.com/2";

// App-folder access type: paths are automatically scoped to the app's folder, so the
// storage key doubles as the Dropbox path (and as files.externalId). Temporary links
// work on private files, so no sharing mutation is ever needed.
export class DropboxStorageProvider implements IStorageProvider {
  public readonly name = "dropbox";

  constructor(private row: StorageProvider, private repo: StorageProviderRepo) {}

  private async token(): Promise<string> {
    const token = await ByosAuth.getAccessToken(this.repo, this.row);
    if (!token) throw new Error("Dropbox is not connected");
    return token;
  }

  public async store(key: string, _contentType: string, contents: Buffer): Promise<string> {
    const token = await this.token();
    const args = JSON.stringify({ path: key, mode: "overwrite", autorename: false, mute: true });
    const headers = { Authorization: "Bearer " + token, "Dropbox-API-Arg": args, "Content-Type": "application/octet-stream" };
    await axios.post(CONTENT_API + "/files/upload", contents, { headers, maxBodyLength: 60000000 });
    return key;
  }

  public async getUploadUrl(key: string, _contentType: string, _size: number): Promise<PresignedPostData | null> {
    const token = await this.token();
    const body = { commit_info: { path: key, mode: "overwrite", autorename: false, mute: true } };
    const resp = await axios.post(API + "/files/get_temporary_upload_link", body, { headers: { Authorization: "Bearer " + token } });
    if (!resp.data?.link) return null;
    return { url: resp.data.link, fields: {}, key, method: "POST", rawBody: true, headers: { "Content-Type": "application/octet-stream" } };
  }

  public async remove(key: string): Promise<void> {
    const token = await this.token();
    try {
      await axios.post(API + "/files/delete_v2", { path: key }, { headers: { Authorization: "Bearer " + token } });
    } catch (e: any) {
      const summary = e?.response?.data?.error_summary || "";
      if (!summary.startsWith("path_lookup/not_found")) throw e;
    }
  }

  public async list(_prefix: string): Promise<string[]> {
    return [];
  }

  public async move(oldKey: string, newKey: string): Promise<void> {
    throw new Error("move is not supported by the Dropbox storage provider (" + oldKey + " -> " + newKey + ")");
  }

  public async getDownloadUrl(key: string): Promise<string | null> {
    const token = await this.token();
    const resp = await axios.post(API + "/files/get_temporary_link", { path: key }, { headers: { Authorization: "Bearer " + token } });
    return resp.data?.link || null;
  }
}
