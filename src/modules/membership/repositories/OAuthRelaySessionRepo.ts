import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { OAuthRelaySession } from "../models/index.js";
import { DateHelper } from "../helpers/index.js";
import crypto from "crypto";

@injectable()
export class OAuthRelaySessionRepo {
  public async save(model: OAuthRelaySession) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(session: OAuthRelaySession): Promise<OAuthRelaySession> {
    session.id = UniqueIdHelper.shortId();
    const expiresAt = DateHelper.toMysqlDate(session.expiresAt);
    await getDb().insertInto("oAuthRelaySessions").values({
      id: session.id,
      sessionCode: session.sessionCode,
      provider: session.provider,
      redirectUri: session.redirectUri,
      status: session.status || "pending",
      expiresAt: expiresAt as any,
      createdAt: sql`NOW()` as any
    }).execute();
    return session;
  }

  private async update(session: OAuthRelaySession): Promise<OAuthRelaySession> {
    await getDb().updateTable("oAuthRelaySessions").set({
      authCode: session.authCode,
      status: session.status
    }).where("id", "=", session.id).execute();
    return session;
  }

  public async load(id: string): Promise<OAuthRelaySession> {
    return (await getDb().selectFrom("oAuthRelaySessions").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
  }

  public async loadBySessionCode(sessionCode: string): Promise<OAuthRelaySession> {
    const result = await sql`SELECT * FROM oAuthRelaySessions WHERE sessionCode=${sessionCode} AND expiresAt > NOW()`.execute(getDb());
    return (result.rows as any[])?.[0] || null;
  }

  public async delete(id: string) {
    await getDb().deleteFrom("oAuthRelaySessions").where("id", "=", id).execute();
  }

  public async deleteExpired() {
    await sql`DELETE FROM oAuthRelaySessions WHERE expiresAt < NOW()`.execute(getDb());
  }

  // Generate 8-character session code (TV-friendly, no ambiguous characters)
  public static generateSessionCode(): string {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars[crypto.randomInt(chars.length)];
    }
    return code;
  }

  public convertToModel(_churchId: string, data: any) { return data; }
  public convertAllToModel(_churchId: string, data: any[]) { return data || []; }
}
