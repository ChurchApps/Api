import crypto from "crypto";
import { Environment } from "../../../shared/helpers/Environment.js";

// HMAC-signed token that authorizes an unauthenticated accept/decline from an email link.

export type ReminderAction = "accept" | "decline";

interface TokenPayload {
  a: string; // assignmentId
  c: string; // churchId
  act: ReminderAction;
  exp: number; // epoch seconds
}

const b64url = (buf: Buffer | string): string => Buffer.from(buf).toString("base64url");
const secret = (): string => Environment.jwtSecret || "serving-reminder-fallback-secret";

const sign = (data: string): string => crypto.createHmac("sha256", secret()).update(data).digest("base64url");

export class ReminderTokenHelper {
  public static create(assignmentId: string, churchId: string, action: ReminderAction, expiresAt: Date): string {
    const payload: TokenPayload = { a: assignmentId, c: churchId, act: action, exp: Math.floor(expiresAt.getTime() / 1000) };
    const body = b64url(JSON.stringify(payload));
    return `${body}.${sign(body)}`;
  }

  public static verify(token: string | undefined): { assignmentId: string; churchId: string; action: ReminderAction } | null {
    if (!token || typeof token !== "string") return null;
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;

    const expected = sign(body);
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as TokenPayload;
      if (!payload.a || !payload.c || (payload.act !== "accept" && payload.act !== "decline")) return null;
      if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
      return { assignmentId: payload.a, churchId: payload.c, action: payload.act };
    } catch {
      return null;
    }
  }
}
