import crypto from "crypto";

// RFC 6238 TOTP (SHA1, 6 digits, 30s) — the format every authenticator app reads from an otpauth:// QR code.
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;

export class TotpHelper {
  public static generateSecret(): string {
    const bytes = crypto.randomBytes(20);
    let bits = "";
    bytes.forEach((b) => { bits += b.toString(2).padStart(8, "0"); });
    let result = "";
    for (let i = 0; i + 5 <= bits.length; i += 5) result += BASE32[parseInt(bits.slice(i, i + 5), 2)];
    return result;
  }

  public static otpauthUrl(secret: string, email: string, issuer: string = "B1"): string {
    const label = encodeURIComponent(issuer + ":" + email);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
  }

  public static currentStep(now: number = Date.now()): number {
    return Math.floor(now / 1000 / STEP_SECONDS);
  }

  public static codeAt(secret: string, step: number): string {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const hmac = crypto.createHmac("sha1", this.decodeBase32(secret)).update(counter).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
    return value.toString().padStart(6, "0");
  }

  /** The time step the code belongs to, allowing one step of clock drift either way, or null. */
  public static matchStep(secret: string, code: string, now: number = Date.now()): number | null {
    const clean = (code || "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(clean)) return null;
    const current = this.currentStep(now);
    for (const step of [current, current - 1, current + 1]) {
      if (crypto.timingSafeEqual(Buffer.from(this.codeAt(secret, step)), Buffer.from(clean))) return step;
    }
    return null;
  }

  private static decodeBase32(secret: string): Buffer {
    let bits = "";
    for (const ch of secret.replace(/=+$/, "").toUpperCase()) {
      const idx = BASE32.indexOf(ch);
      if (idx === -1) continue;
      bits += idx.toString(2).padStart(5, "0");
    }
    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    return Buffer.from(bytes);
  }
}
