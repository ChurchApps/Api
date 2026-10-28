import { injectable } from "inversify";
import { EncryptionHelper, UniqueIdHelper } from "@churchapps/apihelper";
import { ContentProviderAuth } from "../models/index.js";
import { getDb } from "../db/index.js";

// Tokens are stored encrypted. Rows saved before encryption hold plain-text tokens, which never contain "|",
// so they are returned as-is and get encrypted the next time they are saved.
const encryptToken = (value: string) => (value ? EncryptionHelper.encrypt(value) : value);
const decryptToken = (value: string) => (!value || !value.includes("|") ? value : EncryptionHelper.decrypt(value));

@injectable()
export class ContentProviderAuthRepo {
  public async save(model: ContentProviderAuth) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: ContentProviderAuth): Promise<ContentProviderAuth> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("contentProviderAuths").values({ id: model.id, churchId: model.churchId, ministryId: model.ministryId, providerId: model.providerId, accessToken: encryptToken(model.accessToken), refreshToken: encryptToken(model.refreshToken), tokenType: model.tokenType, expiresAt: model.expiresAt, scope: model.scope }).execute();
    return model;
  }

  private async update(model: ContentProviderAuth): Promise<ContentProviderAuth> {
    await getDb().updateTable("contentProviderAuths").set({ ministryId: model.ministryId, providerId: model.providerId, accessToken: encryptToken(model.accessToken), refreshToken: encryptToken(model.refreshToken), tokenType: model.tokenType, expiresAt: model.expiresAt, scope: model.scope }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("contentProviderAuths").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    const row = await getDb().selectFrom("contentProviderAuths").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst();
    return row ? this.rowToModel(row) : null;
  }

  public async loadAll(churchId: string) {
    const rows = await getDb().selectFrom("contentProviderAuths").selectAll().where("churchId", "=", churchId).execute();
    return rows.map(row => this.rowToModel(row));
  }

  public async loadByIds(churchId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const rows = await getDb().selectFrom("contentProviderAuths").selectAll().where("churchId", "=", churchId).where("id", "in", ids).execute();
    return rows.map(row => this.rowToModel(row));
  }

  public async loadByMinistry(churchId: string, ministryId: string) {
    const rows = await getDb().selectFrom("contentProviderAuths").selectAll().where("churchId", "=", churchId).where("ministryId", "=", ministryId).execute();
    return rows.map(row => this.rowToModel(row));
  }

  public async loadByMinistryAndProvider(churchId: string, ministryId: string, providerId: string) {
    const row = await getDb().selectFrom("contentProviderAuths").selectAll().where("churchId", "=", churchId).where("ministryId", "=", ministryId).where("providerId", "=", providerId).orderBy("expiresAt", "desc").executeTakeFirst();
    return row ? this.rowToModel(row) : null;
  }

  public async loadChurchLevel(churchId: string) {
    const rows = await getDb().selectFrom("contentProviderAuths").selectAll().where("churchId", "=", churchId).where((eb) => eb.or([eb("ministryId", "is", null), eb("ministryId", "=", "")])).execute();
    return rows.map(row => this.rowToModel(row));
  }

  public async loadChurchLevelByProvider(churchId: string, providerId: string) {
    const row = await getDb().selectFrom("contentProviderAuths").selectAll().where("churchId", "=", churchId).where((eb) => eb.or([eb("ministryId", "is", null), eb("ministryId", "=", "")])).where("providerId", "=", providerId).orderBy("expiresAt", "desc").executeTakeFirst();
    return row ? this.rowToModel(row) : null;
  }

  public convertToModel(_churchId: string, data: any) {
    return data ? this.rowToModel(data) : data;
  }

  public convertAllToModel(_churchId: string, data: any[]) {
    return (data || []).map(row => this.rowToModel(row));
  }

  protected rowToModel(row: any): ContentProviderAuth {
    return {
      id: row.id,
      churchId: row.churchId,
      ministryId: row.ministryId,
      providerId: row.providerId,
      accessToken: decryptToken(row.accessToken),
      refreshToken: decryptToken(row.refreshToken),
      tokenType: row.tokenType,
      expiresAt: row.expiresAt ? new Date(row.expiresAt) : undefined,
      scope: row.scope
    };
  }
}
