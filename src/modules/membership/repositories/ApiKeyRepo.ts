import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { ApiKey } from "../models/index.js";

@injectable()
export class ApiKeyRepo {
  public async save(model: ApiKey) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: ApiKey): Promise<ApiKey> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("apiKeys").values({
      id: model.id,
      churchId: model.churchId,
      personId: model.personId,
      userId: model.userId,
      name: model.name,
      hashedKey: model.hashedKey,
      prefix: model.prefix,
      scopes: model.scopes,
      expiresAt: model.expiresAt,
      createdAt: sql`NOW()` as any
    }).execute();
    return model;
  }

  private async update(model: ApiKey): Promise<ApiKey> {
    await getDb().updateTable("apiKeys").set({
      name: model.name,
      scopes: model.scopes,
      expiresAt: model.expiresAt
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  // Lookup by the plaintext prefix — the indexed, unique credential segment.
  // Not church-scoped: the request hasn't been authenticated yet.
  public async loadByPrefix(prefix: string): Promise<ApiKey> {
    const row = await getDb().selectFrom("apiKeys").selectAll().where("prefix", "=", prefix).executeTakeFirst();
    return this.rowToModel(row);
  }

  public async loadAll(churchId: string): Promise<ApiKey[]> {
    const rows = await getDb().selectFrom("apiKeys").selectAll().where("churchId", "=", churchId).orderBy("createdAt", "desc").execute();
    return rows.map((r) => this.rowToModel(r));
  }

  public async load(churchId: string, id: string): Promise<ApiKey> {
    const row = await getDb().selectFrom("apiKeys").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst();
    return this.rowToModel(row);
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("apiKeys").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  // Throttled to at most one write per key per 5 minutes — avoids a write on
  // every authenticated request. Called fire-and-forget; never blocks a request.
  public async touchLastUsed(id: string) {
    await getDb().updateTable("apiKeys")
      .set({ lastUsedAt: sql`NOW()` as any })
      .where("id", "=", id)
      .where((eb) => eb.or([
        eb("lastUsedAt", "is", null),
        eb("lastUsedAt", "<", sql`NOW() - INTERVAL 5 MINUTE` as any)
      ]))
      .execute();
  }

  private rowToModel(row: any): ApiKey {
    if (!row) return null;
    return {
      id: row.id,
      churchId: row.churchId,
      personId: row.personId,
      userId: row.userId,
      name: row.name,
      hashedKey: row.hashedKey,
      prefix: row.prefix,
      scopes: row.scopes,
      lastUsedAt: row.lastUsedAt,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt
    };
  }

  public convertToModel(_churchId: string, data: any) { return this.rowToModel(data); }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []).map((d) => this.rowToModel(d)); }
}
