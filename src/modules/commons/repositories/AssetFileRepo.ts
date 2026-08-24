import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { AssetFile } from "../models/index.js";

@injectable()
export class AssetFileRepo {
  public async create(file: AssetFile): Promise<AssetFile> {
    file.id = UniqueIdHelper.shortId();
    await getDb().insertInto("assetFiles").values({
      id: file.id,
      assetId: file.assetId,
      submissionId: file.submissionId || null,
      name: file.name,
      action: file.action || "add",
      sizeBytes: file.sizeBytes,
      contentHash: file.contentHash,
      uploadedBy: file.uploadedBy
    } as any).execute();
    return file;
  }

  /** Insert-or-replace keyed on (assetId, name, submissionId) so re-uploads and republished generated files overwrite in place. */
  public async upsert(file: AssetFile): Promise<AssetFile> {
    const existing = await this.loadOne(file.assetId || "", file.name || "", file.submissionId || null);
    if (!existing) return await this.create(file);
    await this.update(existing.id || "", { action: file.action || existing.action, sizeBytes: file.sizeBytes, contentHash: file.contentHash, uploadedBy: file.uploadedBy ?? existing.uploadedBy });
    return { ...existing, ...file, id: existing.id };
  }

  public async loadOne(assetId: string, name: string, submissionId: string | null): Promise<AssetFile | undefined> {
    let q = getDb().selectFrom("assetFiles").selectAll().where("assetId", "=", assetId).where("name", "=", name);
    q = submissionId ? q.where("submissionId", "=", submissionId) : q.where("submissionId", "is", null);
    return await q.executeTakeFirst() as AssetFile | undefined;
  }

  public async loadLive(assetId: string): Promise<AssetFile[]> {
    return await getDb().selectFrom("assetFiles").selectAll().where("assetId", "=", assetId).where("submissionId", "is", null).orderBy("name").execute() as AssetFile[];
  }

  public async loadLiveMany(assetIds: string[]): Promise<Record<string, AssetFile[]>> {
    const out: Record<string, AssetFile[]> = {};
    if (!assetIds.length) return out;
    const rows = await getDb().selectFrom("assetFiles").selectAll().where("assetId", "in", assetIds).where("submissionId", "is", null).execute() as AssetFile[];
    for (const r of rows) (out[r.assetId || ""] ||= []).push(r);
    return out;
  }

  public async loadBySubmission(submissionId: string): Promise<AssetFile[]> {
    return await getDb().selectFrom("assetFiles").selectAll().where("submissionId", "=", submissionId).orderBy("name").execute() as AssetFile[];
  }

  public async loadLiveByHash(contentHash: string): Promise<AssetFile | undefined> {
    return await getDb().selectFrom("assetFiles").selectAll().where("contentHash", "=", contentHash).where("submissionId", "is", null).executeTakeFirst() as AssetFile | undefined;
  }

  public async update(id: string, fields: Partial<AssetFile>): Promise<void> {
    await getDb().updateTable("assetFiles").set({ ...fields } as any).where("id", "=", id).execute();
  }

  public async delete(id: string): Promise<void> {
    await getDb().deleteFrom("assetFiles").where("id", "=", id).execute();
  }

  public async deleteBySubmission(submissionId: string): Promise<void> {
    await getDb().deleteFrom("assetFiles").where("submissionId", "=", submissionId).execute();
  }

  public async deleteByAsset(assetId: string): Promise<void> {
    await getDb().deleteFrom("assetFiles").where("assetId", "=", assetId).execute();
  }
}
