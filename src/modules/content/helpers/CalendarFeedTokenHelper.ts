import crypto from "crypto";
import { Environment } from "../../../shared/helpers/Environment.js";

// HMAC-signed secret for a person's calendar feed link (#1644). Stateless: rotating jwtSecret revokes every link.

const sign = (churchId: string, personId: string): string => crypto.createHmac("sha256", Environment.jwtSecret).update("calfeed:" + churchId + ":" + personId).digest("base64url");

export class CalendarFeedTokenHelper {
  public static create(churchId: string, personId: string): string {
    if (!Environment.jwtSecret) throw new Error("jwtSecret is not configured");
    return sign(churchId, personId);
  }

  public static verify(churchId: string, personId: string, token: unknown): boolean {
    if (!Environment.jwtSecret || !churchId || !personId || !token || typeof token !== "string") return false;
    const actual = Buffer.from(token);
    const expected = Buffer.from(sign(churchId, personId));
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }
}
