import { injectable } from "inversify";
import { eq, and, lt, gt } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { GlobalDrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { oAuthRelaySessions } from "../../../db/schema/membership.js";
import { OAuthRelaySession } from "../models/index.js";
import crypto from "crypto";

@injectable()
export class OAuthRelaySessionRepo extends GlobalDrizzleRepo<typeof oAuthRelaySessions> {
  protected readonly table = oAuthRelaySessions;
  protected readonly moduleName = "membership";

  public async save(session: OAuthRelaySession) {
    if (session.id) {
      return this.update(session);
    } else {
      return this.create(session);
    }
  }

  protected async create(session: OAuthRelaySession): Promise<OAuthRelaySession> {
    session.id = UniqueIdHelper.shortId();
    const data: any = {
      id: session.id,
      sessionCode: session.sessionCode,
      provider: session.provider,
      redirectUri: session.redirectUri,
      status: session.status || "pending",
      expiresAt: session.expiresAt,
      createdAt: new Date()
    };
    await this.db.insert(oAuthRelaySessions).values(data);
    return session;
  }

  protected async update(session: OAuthRelaySession): Promise<OAuthRelaySession> {
    const data: any = {
      authCode: session.authCode,
      status: session.status
    };
    await this.db.update(oAuthRelaySessions).set(data).where(eq(oAuthRelaySessions.id, session.id!));
    return session;
  }

  public load(id: string): Promise<OAuthRelaySession> {
    return this.db.select().from(oAuthRelaySessions).where(eq(oAuthRelaySessions.id, id)).then(r => (r[0] as OAuthRelaySession) ?? null);
  }

  public loadBySessionCode(sessionCode: string): Promise<OAuthRelaySession> {
    return this.db.select().from(oAuthRelaySessions)
      .where(and(eq(oAuthRelaySessions.sessionCode, sessionCode), gt(oAuthRelaySessions.expiresAt, new Date())))
      .then(r => (r[0] as OAuthRelaySession) ?? null);
  }

  public deleteExpired() {
    return this.db.delete(oAuthRelaySessions).where(lt(oAuthRelaySessions.expiresAt, new Date()));
  }

  public static generateSessionCode(): string {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars[crypto.randomInt(chars.length)];
    }
    return code;
  }
}
