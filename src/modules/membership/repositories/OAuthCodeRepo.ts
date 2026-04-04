import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { OAuthCode } from "../models/index.js";
import { DateHelper } from "../helpers/index.js";

@injectable()
export class OAuthCodeRepo {
  public async save(model: OAuthCode) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(authCode: OAuthCode): Promise<OAuthCode> {
    authCode.id = UniqueIdHelper.shortId();
    const expiresAt = DateHelper.toMysqlDate(authCode.expiresAt);
    await getDb().insertInto("oAuthCodes").values({
      id: authCode.id,
      code: authCode.code,
      clientId: authCode.clientId,
      userChurchId: authCode.userChurchId,
      redirectUri: authCode.redirectUri,
      scopes: authCode.scopes,
      expiresAt: expiresAt as any,
      createdAt: sql`NOW()` as any
    }).execute();
    return authCode;
  }

  private async update(authCode: OAuthCode): Promise<OAuthCode> {
    const expiresAt = DateHelper.toMysqlDate(authCode.expiresAt);
    await getDb().updateTable("oAuthCodes").set({
      code: authCode.code,
      clientId: authCode.clientId,
      userChurchId: authCode.userChurchId,
      redirectUri: authCode.redirectUri,
      scopes: authCode.scopes,
      expiresAt: expiresAt as any
    }).where("id", "=", authCode.id).execute();
    return authCode;
  }

  public async load(id: string): Promise<OAuthCode> {
    return (await getDb().selectFrom("oAuthCodes").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
  }

  public async loadByCode(code: string): Promise<OAuthCode> {
    return (await getDb().selectFrom("oAuthCodes").selectAll().where("code", "=", code).executeTakeFirst()) ?? null;
  }

  public async delete(id: string) {
    await getDb().deleteFrom("oAuthCodes").where("id", "=", id).execute();
  }

  public async deleteByCode(code: string) {
    await getDb().deleteFrom("oAuthCodes").where("code", "=", code).execute();
  }

  public async deleteExpired() {
    await sql`DELETE FROM oAuthCodes WHERE expiresAt < NOW()`.execute(getDb());
  }

  public convertToModel(_churchId: string, data: any) { return data; }
  public convertAllToModel(_churchId: string, data: any[]) { return data || []; }
}
