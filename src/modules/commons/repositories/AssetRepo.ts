import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Asset } from "../models/index.js";

export interface AssetSearch {
  assetType?: string;
  tags?: string;
  language?: string;
  q?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

const SORTS: Record<string, [keyof Asset & string, "desc" | "asc"][]> = {
  downloads: [["downloadCount", "desc"]],
  likes: [["likeCount", "desc"]],
  newest: [["createdAt", "desc"]],
  featured: [["featured", "desc"], ["downloadCount", "desc"]]
};

@injectable()
export class AssetRepo {
  public async search(options: AssetSearch): Promise<Asset[]> {
    const pageSize = Math.min(Math.max(options.pageSize || 50, 1), 200);
    const page = Math.max(options.page || 1, 1);
    let query = getDb().selectFrom("assets").selectAll().where("status", "=", "approved");
    if (options.assetType) query = query.where("assetType", "=", options.assetType);
    if (options.language) query = query.where("language", "=", options.language);
    if (options.tags) for (const tag of options.tags.split(",").map((t) => t.trim()).filter(Boolean)) query = query.where("tags", "like", `%${tag}%`);
    if (options.q) query = query.where((eb) => eb.or([eb("name", "like", `%${options.q}%`), eb("description", "like", `%${options.q}%`)]));
    for (const [col, dir] of SORTS[options.sort || ""] || SORTS.newest) query = query.orderBy(col, dir);
    return await query.limit(pageSize).offset((page - 1) * pageSize).execute() as Asset[];
  }

  public async loadById(id: string): Promise<Asset | undefined> {
    return await getDb().selectFrom("assets").selectAll().where("id", "=", id).executeTakeFirst() as Asset | undefined;
  }

  public async loadApproved(id: string): Promise<Asset | undefined> {
    const asset = await this.loadById(id);
    return asset?.status === "approved" ? asset : undefined;
  }

  public async loadByPublisher(userId: string): Promise<Asset[]> {
    return await getDb().selectFrom("assets").selectAll().where("publisherUserId", "=", userId)
      .orderBy("createdAt", "desc").execute() as Asset[];
  }

  // review queue across every asset type — the song-specific queue lives on SongRepo
  public async loadPending(): Promise<Asset[]> {
    return await getDb().selectFrom("assets")
      .select(["id", "name", "assetType", "publisherUserId", "license", "sizeBytes", "createdAt"])
      .where("status", "=", "pending").orderBy("createdAt", "asc").execute() as Asset[];
  }

  public async loadByHash(contentHash: string): Promise<Asset | undefined> {
    return await getDb().selectFrom("assets").selectAll().where("contentHash", "=", contentHash)
      .where("status", "in", ["approved", "pending"]).executeTakeFirst() as Asset | undefined;
  }

  public async create(asset: Asset): Promise<Asset> {
    asset.id = UniqueIdHelper.shortId();
    await getDb().insertInto("assets").values({
      id: asset.id,
      assetType: asset.assetType,
      name: asset.name,
      description: asset.description,
      tags: asset.tags,
      language: asset.language,
      license: asset.license,
      publisherUserId: asset.publisherUserId,
      publisherChurchId: asset.publisherChurchId,
      status: asset.status || "pending",
      contentPath: asset.contentPath,
      thumbPath: asset.thumbPath,
      sizeBytes: asset.sizeBytes,
      contentHash: asset.contentHash,
      version: asset.version,
      appMinVersion: asset.appMinVersion,
      downloadCount: 0,
      likeCount: 0,
      featured: false
    } as any).execute();
    return asset;
  }

  public async update(id: string, fields: Partial<Asset>): Promise<void> {
    await getDb().updateTable("assets").set({ ...fields, modifiedAt: new Date() } as any).where("id", "=", id).execute();
  }

  public async delete(id: string): Promise<void> {
    await getDb().deleteFrom("assetLikes").where("assetId", "=", id).execute();
    await getDb().deleteFrom("assetDownloads").where("assetId", "=", id).execute();
    await getDb().deleteFrom("assets").where("id", "=", id).execute();
  }

  public async recordDownload(assetId: string, ipHash: string): Promise<boolean> {
    const result = await getDb().insertInto("assetDownloads").ignore().values({ assetId, ipHash }).executeTakeFirst();
    return Number(result.numInsertedOrUpdatedRows || 0) > 0;
  }

  public async incrementDownloadCount(id: string): Promise<number> {
    await getDb().updateTable("assets").set((eb) => ({ downloadCount: eb("downloadCount", "+", 1) } as any)).where("id", "=", id).execute();
    return (await this.loadById(id))?.downloadCount || 0;
  }

  public async likeExists(assetId: string, userId: string): Promise<boolean> {
    const row = await getDb().selectFrom("assetLikes").select("id").where("assetId", "=", assetId).where("userId", "=", userId).executeTakeFirst();
    return !!row;
  }

  public async setLike(assetId: string, userId: string, liked: boolean): Promise<{ liked: boolean; likeCount: number }> {
    if (liked) {
      const result = await getDb().insertInto("assetLikes").ignore().values({ id: UniqueIdHelper.shortId(), assetId, userId }).executeTakeFirst();
      if (Number(result.numInsertedOrUpdatedRows || 0) > 0) {
        await getDb().updateTable("assets").set((eb) => ({ likeCount: eb("likeCount", "+", 1) } as any)).where("id", "=", assetId).execute();
      }
    } else {
      const result = await getDb().deleteFrom("assetLikes").where("assetId", "=", assetId).where("userId", "=", userId).executeTakeFirst();
      if (Number(result.numDeletedRows || 0) > 0) {
        await getDb().updateTable("assets").set((eb) => ({ likeCount: eb("likeCount", "-", 1) } as any))
          .where("id", "=", assetId).where("likeCount", ">", 0).execute();
      }
    }
    return { liked, likeCount: (await this.loadById(assetId))?.likeCount || 0 };
  }

  public async toggleLike(assetId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
    return await this.setLike(assetId, userId, !(await this.likeExists(assetId, userId)));
  }
}
