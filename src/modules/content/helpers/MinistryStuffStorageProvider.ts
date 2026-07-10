import axios from "axios";
import type { IStorageProvider, PresignedPostData, StorageQuota } from "@churchapps/apihelper";
import { Environment } from "../../../shared/helpers/Environment.js";

export class QuotaExceededError extends Error {
  public usedBytes: number;
  public quotaBytes: number;
  constructor(usedBytes: number, quotaBytes: number) {
    super("storage_quota_exceeded");
    this.usedBytes = usedBytes;
    this.quotaBytes = quotaBytes;
  }
}

// Keys arrive as "/<churchId>/files/..."; churchId is derived from the key so the
// provider satisfies IStorageProvider's church-less method signatures.
export class MinistryStuffStorageProvider implements IStorageProvider {
  public readonly name = "ministrystuff";

  private headers() {
    return { "X-Service-Key": Environment.ministryStuffServiceKey };
  }

  private base() {
    return Environment.ministryStuffApi;
  }

  private churchIdFromKey(key: string): string {
    return key.replace(/^\//, "").split("/")[0];
  }

  public async store(key: string, contentType: string, contents: Buffer): Promise<string> {
    try {
      const resp = await axios.post(this.base() + "/storage/store", {
        churchId: this.churchIdFromKey(key),
        key,
        contentType,
        base64: contents.toString("base64")
      }, { headers: this.headers(), maxBodyLength: 60000000 });
      return resp.data.publicUrl;
    } catch (e: any) {
      this.rethrowQuota(e);
      throw e;
    }
  }

  public async getUploadUrl(key: string, contentType: string, size: number): Promise<PresignedPostData | null> {
    try {
      const resp = await axios.post(this.base() + "/storage/presign", {
        churchId: this.churchIdFromKey(key),
        key,
        contentType,
        size
      }, { headers: this.headers() });
      if (!resp.data?.url) return null;
      return resp.data;
    } catch (e: any) {
      this.rethrowQuota(e);
      throw e;
    }
  }

  public async confirmUpload(key: string): Promise<void> {
    await axios.post(this.base() + "/storage/confirm", { churchId: this.churchIdFromKey(key), key }, { headers: this.headers() });
  }

  public async remove(key: string): Promise<void> {
    await axios.delete(this.base() + "/storage/object", { headers: this.headers(), data: { churchId: this.churchIdFromKey(key), key } });
  }

  public async removeFolder(key: string): Promise<void> {
    const files = await this.list(key);
    await Promise.allSettled(files.map((f) => this.remove(f)));
  }

  public async list(prefix: string): Promise<string[]> {
    const churchId = this.churchIdFromKey(prefix);
    const resp = await axios.get(this.base() + "/storage/list?churchId=" + encodeURIComponent(churchId) + "&prefix=" + encodeURIComponent(prefix), { headers: this.headers() });
    return resp.data?.keys || [];
  }

  public async move(oldKey: string, newKey: string): Promise<void> {
    throw new Error("move is not supported by the MinistryStuff storage provider (" + oldKey + " -> " + newKey + ")");
  }

  public async getQuota(churchId: string): Promise<StorageQuota | null> {
    const resp = await axios.get(this.base() + "/storage/quota?churchId=" + encodeURIComponent(churchId), { headers: this.headers() });
    return resp.data || null;
  }

  private rethrowQuota(e: any) {
    const data = e?.response?.data;
    if (data?.reason === "quota_exceeded") throw new QuotaExceededError(data.usedBytes || 0, data.quotaBytes || 0);
  }
}
