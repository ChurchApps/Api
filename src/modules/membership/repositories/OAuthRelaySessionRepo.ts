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
      ...(session.codeChallenge ? { codeChallenge: session.codeChallenge } : {}),
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
    return (await getDb().selectFrom("oAuthRelaySessions").selectAll()
      .where("sessionCode", "=", sessionCode)
      .where("expiresAt", ">", sql`NOW()` as any)
      .executeTakeFirst()) ?? null;
  }

  public async delete(id: string) {
    await getDb().deleteFrom("oAuthRelaySessions").where("id", "=", id).execute();
  }

  // One winner: clears the captured auth code so a second exchange cannot replay it.
  public async claimCompleted(id: string): Promise<boolean> {
    if (!id) return false;
    const result = await getDb().updateTable("oAuthRelaySessions")
      .set({ status: "expired", authCode: null })
      .where("id", "=", id)
      .where("status", "=", "completed")
      .executeTakeFirst();
    return Number(result?.numUpdatedRows ?? 0) > 0;
  }

  public async deleteExpired() {
    await getDb().deleteFrom("oAuthRelaySessions").where("expiresAt", "<", sql`NOW()` as any).execute();
  }

  // Generate 8-character session code (TV-friendly, no ambiguous characters)
  public static sessionCodePattern = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

  public static isSessionCode(value: unknown): value is string {
    return typeof value === "string" && OAuthRelaySessionRepo.sessionCodePattern.test(value);
  }

  public static generateSessionCode(): string {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i++) code += chars[crypto.randomInt(chars.length)];
    return code;
  }

  public convertToModel(_churchId: string, data: any) { return data; }
  public convertAllToModel(_churchId: string, data: any[]) { return data || []; }
}
