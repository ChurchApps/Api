import axios from "axios";
import type { IStorageProvider, PresignedPostData } from "@churchapps/apihelper";
import { StorageProvider } from "../models/index.js";
import type { StorageProviderRepo } from "../repositories/StorageProviderRepo.js";
import { ByosAuth } from "./ByosAuth.js";

const GRAPH = "https://graph.microsoft.com/v1.0";
// Graph requires chunk sizes in multiples of 320KiB; 20MiB = 64 × 320KiB.
const CHUNK_SIZE = 20971520;

// Files.ReadWrite.AppFolder scope: everything lives under the app's approot folder,
// addressed by path, so the storage key doubles as files.externalId.
export class OneDriveStorageProvider implements IStorageProvider {
  public readonly name = "onedrive";

  constructor(private row: StorageProvider, private repo: StorageProviderRepo) {}

  private async token(): Promise<string> {
    const token = await ByosAuth.getAccessToken(this.repo, this.row);
    if (!token) throw new Error("OneDrive is not connected");
    return token;
  }

  private itemUrl(key: string, suffix: string = ""): string {
    return GRAPH + "/me/drive/special/approot:" + encodeURI(key) + ":" + suffix;
  }

  public async store(key: string, contentType: string, contents: Buffer): Promise<string> {
    const token = await this.token();
    const headers = { Authorization: "Bearer " + token, "Content-Type": contentType };
    await axios.put(this.itemUrl(key, "/content"), contents, { headers, maxBodyLength: 60000000 });
    return key;
  }

  public async getUploadUrl(key: string, _contentType: string, _size: number): Promise<PresignedPostData | null> {
    const token = await this.token();
    const body = { item: { "@microsoft.graph.conflictBehavior": "replace" } };
    const resp = await axios.post(this.itemUrl(key, "/createUploadSession"), body, { headers: { Authorization: "Bearer " + token } });
    if (!resp.data?.uploadUrl) return null;
    return { url: resp.data.uploadUrl, fields: {}, key, method: "PUT", rawBody: true, chunkSize: CHUNK_SIZE };
  }

  public async remove(key: string): Promise<void> {
    const token = await this.token();
    try {
      await axios.delete(this.itemUrl(key), { headers: { Authorization: "Bearer " + token } });
    } catch (e: any) {
      if (e?.response?.status !== 404) throw e;
    }
  }

  public async list(_prefix: string): Promise<string[]> {
    return [];
  }

  public async move(oldKey: string, newKey: string): Promise<void> {
    throw new Error("move is not supported by the OneDrive storage provider (" + oldKey + " -> " + newKey + ")");
  }

  public async getDownloadUrl(key: string): Promise<string | null> {
    const token = await this.token();
    const resp = await axios.get(this.itemUrl(key, "?select=id,@microsoft.graph.downloadUrl"), { headers: { Authorization: "Bearer " + token } });
    return resp.data?.["@microsoft.graph.downloadUrl"] || null;
  }
}
