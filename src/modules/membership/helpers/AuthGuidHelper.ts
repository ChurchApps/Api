import crypto from "crypto";
import { v4 } from "uuid";

const AUTH_GUID_TTL_MS = 15 * 60 * 1000;

export class AuthGuidHelper {
  public static readonly ttlMs = AUTH_GUID_TTL_MS;

  public static hash(raw: string): string {
    return crypto.createHash("sha256").update(raw).digest("hex");
  }

  public static mint(): { raw: string; stored: string } {
    const raw = v4();
    return { raw, stored: `${this.hash(raw)}:${Date.now() + AUTH_GUID_TTL_MS}` };
  }

  public static parse(stored: string | null | undefined): { hash: string; expires: number; loginUsed: boolean } | null {
    if (!stored) return null;
    const parts = stored.split(":");
    if (parts.length < 2 || parts[0].length !== 64) return null;
    const expires = Number(parts[1]);
    if (!Number.isFinite(expires)) return null;
    return { hash: parts[0], expires, loginUsed: parts[2] === "1" };
  }

  public static isExpired(stored: string | null | undefined): boolean {
    const parsed = this.parse(stored);
    if (!parsed) return !stored;
    return parsed.expires < Date.now();
  }

  public static canLogin(stored: string | null | undefined): boolean {
    if (!stored || this.isExpired(stored)) return false;
    return this.parse(stored)?.loginUsed !== true;
  }

  public static canSetPassword(stored: string | null | undefined): boolean {
    return !!stored && !this.isExpired(stored);
  }

  public static markLoginUsed(stored: string, raw: string): string {
    const parsed = this.parse(stored);
    if (parsed) return `${parsed.hash}:${parsed.expires}:1`;
    return `${this.hash(raw)}:${Date.now() + AUTH_GUID_TTL_MS}:1`;
  }
}
