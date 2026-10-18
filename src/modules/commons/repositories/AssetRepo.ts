import { injectable } from "inversify";
import { type ExpressionBuilder, sql } from "kysely";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import type { CommonsDatabase } from "../db/DatabaseTypes.js";
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


/** Assets a user publishes, as primary or co-publisher. Works on any query over assets. */
export const publishedBy = (userId: string) => (eb: ExpressionBuilder<CommonsDatabase, "assets">) =>
  eb.or([eb("assets.publisherUserId", "=", userId), eb("assets.id", "in", eb.selectFrom("assetPublishers").select("assetPublishers.assetId").where("assetPublishers.userId", "=", userId))]);

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
      case "saves": query = query.orderBy("saveCount", "desc").orderBy("downloadCount", "desc"); break;
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

  /** Songs a writer has live in the library — the "songs released" milestone count. */
  public async countPublishedSongs(userId: string): Promise<number> {
    const row = await getDb().selectFrom("assets").select(sql<number>`count(*)`.as("n"))
      .where(publishedBy(userId)).where("assetType", "=", "song").where("status", "=", "published").executeTakeFirst();
    return Number(row?.n || 0);
  }

  /** Everyone who has published a song, live or not, so a nightly resync also lowers counts after a takedown. */
  public async loadSongPublisherIds(): Promise<string[]> {
    const rows = await getDb().selectFrom("assets").select("publisherUserId").distinct()
      .where("assetType", "=", "song").where("publisherUserId", "is not", null).execute();
    const co = await getDb().selectFrom("assetPublishers").innerJoin("assets", "assets.id", "assetPublishers.assetId")
      .select("assetPublishers.userId").distinct().where("assets.assetType", "=", "song").execute();
    return [...new Set([...rows.map((r) => r.publisherUserId as string), ...co.map((r) => r.userId as string)])];
  }

  public async loadByPublisher(userId: string): Promise<Asset[]> {
    return await getDb().selectFrom("assets").selectAll().where(publishedBy(userId)).orderBy("createdAt", "desc").execute() as Asset[];
  }

  /** Everyone who publishes an asset: the primary publisher first, then its co-publishers. */
  public async loadPublisherIds(asset: Asset): Promise<string[]> {
    const co = await getDb().selectFrom("assetPublishers").select("userId").where("assetId", "=", asset.id || "").orderBy("createdAt").execute();
    return [...new Set([asset.publisherUserId, ...co.map((r) => r.userId)].filter((id): id is string => !!id))];
  }

  /** assetId → all its publisher ids, primary first, for a list of assets. */
  public async loadPublisherIdsFor(assets: Asset[]): Promise<Record<string, string[]>> {
    const out: Record<string, string[]> = {};
    for (const a of assets) out[a.id || ""] = a.publisherUserId ? [a.publisherUserId] : [];
    if (!assets.length) return out;
    const co = await getDb().selectFrom("assetPublishers").select(["assetId", "userId"]).where("assetId", "in", assets.map((a) => a.id || "")).orderBy("createdAt").execute();
    for (const r of co) if (!out[r.assetId || ""].includes(r.userId || "")) out[r.assetId || ""].push(r.userId || "");
    return out;
  }

  public async isPublisher(asset: Asset | undefined, userId: string | undefined): Promise<boolean> {
    if (!asset || !userId) return false;
    if (asset.publisherUserId === userId) return true;
    return !!(await getDb().selectFrom("assetPublishers").select("userId").where("assetId", "=", asset.id || "").where("userId", "=", userId).executeTakeFirst());
  }

  /** Replaces every publisher of an asset: the first id becomes the primary, the rest its co-publishers. */
  public async setPublishers(assetId: string, userIds: string[], addedBy: string): Promise<void> {
    const [primary, ...co] = [...new Set(userIds.filter(Boolean))];
    await getDb().transaction().execute(async (trx) => {
      await trx.updateTable("assets").set({ publisherUserId: primary || null, modifiedAt: new Date() } as any).where("id", "=", assetId).execute();
      await trx.deleteFrom("assetPublishers").where("assetId", "=", assetId).execute();
      if (co.length) await trx.insertInto("assetPublishers").values(co.map((userId) => ({ assetId, userId, addedBy }))).execute();
    });
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
      saveCount: 0,
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
    await getDb().deleteFrom("assetPublishers").where("assetId", "=", id).execute();
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
