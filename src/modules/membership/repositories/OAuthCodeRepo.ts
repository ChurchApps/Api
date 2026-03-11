import { injectable } from "inversify";
import { eq, lt } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { GlobalDrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { oAuthCodes } from "../../../db/schema/membership.js";
import { OAuthCode } from "../models/index.js";

@injectable()
export class OAuthCodeRepo extends GlobalDrizzleRepo<typeof oAuthCodes> {
  protected readonly table = oAuthCodes;
  protected readonly moduleName = "membership";

  public async save(authCode: OAuthCode) {
    if (authCode.id) {
      return this.update(authCode);
    } else {
      return this.create(authCode);
    }
  }

  protected async create(authCode: OAuthCode): Promise<OAuthCode> {
    authCode.id = UniqueIdHelper.shortId();
    const data: any = { ...authCode, createdAt: new Date() };
    await this.db.insert(oAuthCodes).values(data);
    return authCode;
  }

  protected async update(authCode: OAuthCode): Promise<OAuthCode> {
    const data: any = {
      code: authCode.code,
      clientId: authCode.clientId,
      userChurchId: authCode.userChurchId,
      redirectUri: authCode.redirectUri,
      scopes: authCode.scopes,
      expiresAt: authCode.expiresAt
    };
    await this.db.update(oAuthCodes).set(data).where(eq(oAuthCodes.id, authCode.id!));
    return authCode;
  }

  public load(id: string): Promise<OAuthCode> {
    return this.db.select().from(oAuthCodes).where(eq(oAuthCodes.id, id)).then(r => (r[0] as OAuthCode) ?? null);
  }

  public loadByCode(code: string): Promise<OAuthCode> {
    return this.db.select().from(oAuthCodes).where(eq(oAuthCodes.code, code)).then(r => (r[0] as OAuthCode) ?? null);
  }

  public deleteByCode(code: string) {
    return this.db.delete(oAuthCodes).where(eq(oAuthCodes.code, code));
  }

  public deleteExpired() {
    return this.db.delete(oAuthCodes).where(lt(oAuthCodes.expiresAt, new Date()));
  }
}
