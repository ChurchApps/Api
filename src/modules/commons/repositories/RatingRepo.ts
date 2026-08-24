import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { AssetRating } from "../models/index.js";

@injectable()
export class RatingRepo {
  public async load(assetId: string, userId: string): Promise<AssetRating | undefined> {
    return await getDb().selectFrom("assetRatings").selectAll().where("assetId", "=", assetId).where("userId", "=", userId).executeTakeFirst() as AssetRating | undefined;
  }

  public async loadForUser(userId: string, assetIds: string[]): Promise<Record<string, AssetRating>> {
    const out: Record<string, AssetRating> = {};
    if (!assetIds.length) return out;
    const rows = await getDb().selectFrom("assetRatings").selectAll().where("userId", "=", userId).where("assetId", "in", assetIds).execute() as AssetRating[];
    for (const r of rows) out[r.assetId || ""] = r;
    return out;
  }

  /** Upserts the user's row and applies the star delta to the asset counters in the same statement batch. */
  public async setStars(assetId: string, userId: string, stars: number | null): Promise<void> {
    const existing = await this.load(assetId, userId);
    const before = existing?.stars ?? null;
    if (before === stars) return;
    await this.write(assetId, userId, { stars, saved: existing?.saved || false });
    const countDelta = (stars == null ? 0 : 1) - (before == null ? 0 : 1);
    const sumDelta = (stars || 0) - (before || 0);
    await getDb().updateTable("assets").set((eb) => ({ ratingCount: eb("ratingCount", "+", countDelta), ratingSum: eb("ratingSum", "+", sumDelta) } as any)).where("id", "=", assetId).execute();
  }

  public async setSaved(assetId: string, userId: string, saved: boolean): Promise<void> {
    const existing = await this.load(assetId, userId);
    await this.write(assetId, userId, { stars: existing?.stars ?? null, saved });
  }

  public async loadSavedAssetIds(userId: string): Promise<string[]> {
    const rows = await getDb().selectFrom("assetRatings").select("assetId").where("userId", "=", userId).where("saved", "=", true as any).orderBy("modifiedAt", "desc").execute();
    return rows.map((r) => r.assetId as string);
  }

  private async write(assetId: string, userId: string, values: { stars: number | null; saved: boolean }): Promise<void> {
    if (values.stars == null && !values.saved) {
      await getDb().deleteFrom("assetRatings").where("assetId", "=", assetId).where("userId", "=", userId).execute();
      return;
    }
    await sql`insert into assetRatings (assetId, userId, stars, saved) values (${assetId}, ${userId}, ${values.stars}, ${values.saved ? 1 : 0})
      on duplicate key update stars = values(stars), saved = values(saved), modifiedAt = now()`.execute(getDb());
  }
}
