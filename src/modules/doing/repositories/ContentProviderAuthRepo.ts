import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { ContentProviderAuth } from "../models/index.js";
import { getDb } from "../db/index.js";

@injectable()
export class ContentProviderAuthRepo {
  public async save(model: ContentProviderAuth) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: ContentProviderAuth): Promise<ContentProviderAuth> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("contentProviderAuths").values({
      id: model.id, churchId: model.churchId, ministryId: model.ministryId, providerId: model.providerId, accessToken: model.accessToken, refreshToken: model.refreshToken, tokenType: model.tokenType, expiresAt: model.expiresAt, scope: model.scope
    }).execute();
    return model;
  }

  private async update(model: ContentProviderAuth): Promise<ContentProviderAuth> {
    await getDb().updateTable("contentProviderAuths").set({
      ministryId: model.ministryId, providerId: model.providerId, accessToken: model.accessToken, refreshToken: model.refreshToken, tokenType: model.tokenType, expiresAt: model.expiresAt, scope: model.scope
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("contentProviderAuths").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("contentProviderAuths").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("contentProviderAuths").selectAll().where("churchId", "=", churchId).execute();
  }

  public async loadByIds(churchId: string, ids: string[]) {
    return getDb().selectFrom("contentProviderAuths").selectAll().where("churchId", "=", churchId).where("id", "in", ids).execute();
  }

  public async loadByMinistry(churchId: string, ministryId: string) {
    return getDb().selectFrom("contentProviderAuths").selectAll().where("churchId", "=", churchId).where("ministryId", "=", ministryId).execute();
  }

  public async loadByMinistryAndProvider(churchId: string, ministryId: string, providerId: string) {
    return (await getDb().selectFrom("contentProviderAuths").selectAll().where("churchId", "=", churchId).where("ministryId", "=", ministryId).where("providerId", "=", providerId).executeTakeFirst()) ?? null;
  }

  protected rowToModel(row: any): ContentProviderAuth {
    return {
      id: row.id,
      churchId: row.churchId,
      ministryId: row.ministryId,
      providerId: row.providerId,
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      tokenType: row.tokenType,
      expiresAt: row.expiresAt ? new Date(row.expiresAt) : undefined,
      scope: row.scope
    };
  }
}
