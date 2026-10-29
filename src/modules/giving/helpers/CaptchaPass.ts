import crypto from "crypto";
import { Environment } from "../../../shared/helpers/Environment.js";

// Short-lived HMAC-signed proof that a guest giver passed reCAPTCHA. Google tokens verify only once,
// and the Stripe guest flow makes two money calls (addcard, then charge), so the pass is reusable until it expires.

interface PassPayload {
  p: "give";
  c?: string; // churchId
  exp: number; // epoch seconds
}

const sign = (data: string): string => crypto.createHmac("sha256", Environment.jwtSecret).update(data).digest("base64url");

export class CaptchaPass {
  public static readonly ttlSeconds = 600;

  public static create(churchId?: string): string {
    if (!Environment.jwtSecret) throw new Error("jwtSecret is not configured");
    const payload: PassPayload = { p: "give", ...(churchId ? { c: churchId } : {}), exp: Math.floor(Date.now() / 1000) + this.ttlSeconds };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${sign(body)}`;
  }

  // True when enforcement is off (CAPTCHA_ENFORCE !== "true") or req.body.captchaPass is a valid, unexpired pass for this church.
  public static verify(req: { body?: any }, churchId: string): boolean {
    if (!Environment.captchaEnforce) return true;
    const token = req.body?.captchaPass;
    if (!token || typeof token !== "string" || !Environment.jwtSecret) return false;
    const [body, sig] = token.split(".");
    if (!body || !sig) return false;

    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(sign(body));
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return false;

    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as PassPayload;
      if (payload.p !== "give") return false;
      if (!payload.exp || payload.exp * 1000 < Date.now()) return false;
      if (payload.c && payload.c !== churchId) return false;
      return true;
    } catch {
      return false;
    }
  }
}
