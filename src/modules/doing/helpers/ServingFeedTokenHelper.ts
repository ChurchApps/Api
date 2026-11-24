import crypto from "crypto";
import { Environment } from "../../../shared/helpers/Environment.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";

// Secret for a person's serving calendar link: HMAC over church, person and a per-person nonce.
// The nonce lives in a private membership setting; replacing it ("Reset link") kills every older link.
const sign = (churchId: string, personId: string, nonce: string): string =>
  crypto.createHmac("sha256", Environment.jwtSecret).update("servingfeed:" + churchId + ":" + personId + ":" + nonce).digest("base64url");

export class ServingFeedTokenHelper {
  static settingKey(personId: string): string {
    return "servingFeedNonce:" + personId;
  }

  private static async loadNonce(churchId: string, personId: string): Promise<string> {
    return (await getMembershipModuleGateway().loadSetting(churchId, this.settingKey(personId))) || "";
  }

  public static async create(churchId: string, personId: string): Promise<string> {
    if (!Environment.jwtSecret) throw new Error("jwtSecret is not configured");
    return sign(churchId, personId, await this.loadNonce(churchId, personId));
  }

  public static async reset(churchId: string, personId: string): Promise<string> {
    if (!Environment.jwtSecret) throw new Error("jwtSecret is not configured");
    const nonce = crypto.randomBytes(16).toString("base64url");
    await getMembershipModuleGateway().saveSetting(churchId, this.settingKey(personId), nonce);
    return sign(churchId, personId, nonce);
  }

  public static async verify(churchId: unknown, personId: unknown, token: unknown): Promise<boolean> {
    if (!Environment.jwtSecret || typeof churchId !== "string" || typeof personId !== "string" || typeof token !== "string") return false;
    if (!churchId || !personId || !token) return false;
    const actual = Buffer.from(token);
    const expected = Buffer.from(sign(churchId, personId, await this.loadNonce(churchId, personId)));
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }
}
