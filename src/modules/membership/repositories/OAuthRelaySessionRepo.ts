import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { OAuthRelaySession } from "../models/index.js";
import { DateHelper } from "../helpers/index.js";
import { BaseRepo } from "../../../shared/infrastructure/BaseRepo.js";
import { injectable } from "inversify";
import crypto from "crypto";

@injectable()
export class OAuthRelaySessionRepo extends BaseRepo<OAuthRelaySession> {
  protected tableName = "oAuthRelaySessions";
  protected hasSoftDelete = false;

  protected async create(session: OAuthRelaySession): Promise<OAuthRelaySession> {
    session.id = this.createId();
    const expiresAt = DateHelper.toMysqlDate(session.expiresAt);
    const sql = `INSERT INTO oAuthRelaySessions (id, sessionCode, provider, redirectUri, status, expiresAt, createdAt)
                 VALUES (?, ?, ?, ?, ?, ?, NOW());`;
    const params = [
      session.id,
      session.sessionCode,
      session.provider,
      session.redirectUri,
      session.status || "pending",
      expiresAt
    ];
    await TypedDB.query(sql, params);
    return session;
  }

  protected async update(session: OAuthRelaySession): Promise<OAuthRelaySession> {
    const sql = "UPDATE oAuthRelaySessions SET authCode=?, status=? WHERE id=?;";
    const params = [session.authCode, session.status, session.id];
    await TypedDB.query(sql, params);
    return session;
  }

  public load(id: string): Promise<OAuthRelaySession> {
    return TypedDB.queryOne("SELECT * FROM oAuthRelaySessions WHERE id=?", [id]);
  }

  public loadBySessionCode(sessionCode: string): Promise<OAuthRelaySession> {
    return TypedDB.queryOne(
      "SELECT * FROM oAuthRelaySessions WHERE sessionCode=? AND expiresAt > NOW()",
      [sessionCode]
    );
  }

  public delete(id: string) {
    return TypedDB.query("DELETE FROM oAuthRelaySessions WHERE id=?", [id]);
  }

  public deleteExpired() {
    return TypedDB.query("DELETE FROM oAuthRelaySessions WHERE expiresAt < NOW()", []);
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
}
