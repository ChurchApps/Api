import { injectable } from "inversify";
import { sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Asset } from "../models/index.js";

export interface AssetSearch {
  assetType?: string;
  tags?: string;
  language?: string;
  license?: string;
  featured?: boolean;
  q?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminAssetSearch {
  q?: string;
  status?: string;
  assetType?: string;
  page?: number;
  pageSize?: number;
}

// Bayesian prior of 3.0 with weight 3 so a lone 5-star does not outrank a well-rated asset
const RATING_SORT = sql`(ratingSum + 9) / (ratingCount + 3)`;

@injectable()
export class AssetRepo {
  public async search(options: AssetSearch): Promise<{ assets: Asset[]; total: number }> {
    const pageSize = Math.min(Math.max(options.pageSize || 50, 1), 200);
    const page = Math.max(options.page || 1, 1);
    let base = getDb().selectFrom("assets").where("status", "=", "published");
    if (options.assetType) base = base.where("assetType", "=", options.assetType);
    if (options.language) base = base.where("language", "=", options.language);
    if (options.license) base = base.where("license", "=", options.license);
    if (options.featured) base = base.where("featured", "=", true as any);
    if (options.tags) for (const tag of options.tags.split(",").map((t) => t.trim()).filter(Boolean)) base = base.where("tags", "like", `%${tag}%`);
    if (options.q) base = base.where((eb) => eb.or([eb("name", "like", `%${options.q}%`), eb("description", "like", `%${options.q}%`)]));
    const total = Number((await base.select(sql<number>`count(*)`.as("n")).executeTakeFirst())?.n || 0);
    let query = base.selectAll();
    switch (options.sort) {
      case "downloads": query = query.orderBy("downloadCount", "desc"); break;
      case "rating": query = query.orderBy(RATING_SORT as any, "desc").orderBy("ratingCount", "desc"); break;
      case "featured": query = query.orderBy("featured", "desc").orderBy("downloadCount", "desc"); break;
      default: query = query.orderBy("publishedAt", "desc");
    }
    const assets = await query.limit(pageSize).offset((page - 1) * pageSize).execute() as Asset[];
    return { assets, total };
  }

  public async adminSearch(options: AdminAssetSearch): Promise<Asset[]> {
    const pageSize = Math.min(Math.max(options.pageSize || 100, 1), 500);
    const page = Math.max(options.page || 1, 1);
    let query = getDb().selectFrom("assets").selectAll();
    if (options.status) query = query.where("status", "=", options.status);
    if (options.assetType) query = query.where("assetType", "=", options.assetType);
    if (options.q) query = query.where((eb) => eb.or([eb("name", "like", `%${options.q}%`), eb("id", "=", options.q || "")]));
    return await query.orderBy("modifiedAt", "desc").limit(pageSize).offset((page - 1) * pageSize).execute() as Asset[];
  }

  public async loadById(id: string): Promise<Asset | undefined> {
    return await getDb().selectFrom("assets").selectAll().where("id", "=", id).executeTakeFirst() as Asset | undefined;
  }

  public async loadPublished(id: string): Promise<Asset | undefined> {
    const asset = await this.loadById(id);
    return asset?.status === "published" ? asset : undefined;
  }

  public async loadByIds(ids: string[]): Promise<Asset[]> {
    if (!ids.length) return [];
    return await getDb().selectFrom("assets").selectAll().where("id", "in", ids).execute() as Asset[];
  }

  public async loadByPublisher(userId: string): Promise<Asset[]> {
    return await getDb().selectFrom("assets").selectAll().where("publisherUserId", "=", userId).orderBy("createdAt", "desc").execute() as Asset[];
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
      downloadCount: 0,
      ratingCount: 0,
      ratingSum: 0,
      featured: false
    } as any).execute();
    return asset;
  }

  public async update(id: string, fields: Partial<Asset>): Promise<void> {
    await getDb().updateTable("assets").set({ ...fields, modifiedAt: new Date() } as any).where("id", "=", id).execute();
  }

  /** Only for assets that were never published (a rejected first submission); counters and ratings go with it. */
  public async delete(id: string): Promise<void> {
    await getDb().deleteFrom("assetRatings").where("assetId", "=", id).execute();
    await getDb().deleteFrom("assetDownloads").where("assetId", "=", id).execute();
    await getDb().deleteFrom("songs").where("assetId", "=", id).execute();
    await getDb().deleteFrom("assets").where("id", "=", id).execute();
  }

  public async recordDownload(assetId: string, ipHash: string): Promise<boolean> {
    const result = await getDb().insertInto("assetDownloads").ignore().values({ assetId, ipHash, ymd: sql`curdate()` } as any).executeTakeFirst();
    return Number(result.numInsertedOrUpdatedRows || 0) > 0;
  }

  public async incrementDownloadCount(id: string): Promise<number> {
    await getDb().updateTable("assets").set((eb) => ({ downloadCount: eb("downloadCount", "+", 1) } as any)).where("id", "=", id).execute();
    return (await this.loadById(id))?.downloadCount || 0;
  }

  public async pruneDownloads(days: number): Promise<number> {
    const result = await getDb().deleteFrom("assetDownloads").where("ymd", "<", sql<string>`date_sub(curdate(), interval ${days} day)`).executeTakeFirst();
    return Number(result.numDeletedRows || 0);
  }
}
