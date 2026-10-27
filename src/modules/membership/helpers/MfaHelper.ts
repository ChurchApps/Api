import crypto from "crypto";
import jwt from "jsonwebtoken";
import { EncryptionHelper } from "@churchapps/apihelper";
import { Environment } from "./index.js";
import type { Repos } from "../repositories/index.js";
import { TotpHelper } from "./TotpHelper.js";

const BACKUP_CODE_COUNT = 10;
const BACKUP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export class MfaHelper {
  // A distinct signing key, so a pending-2FA token can never pass as a user or church JWT.
  private static tokenSecret() { return Environment.jwtSecret + "|mfa"; }

  public static createLoginToken(userId: string): string {
    return jwt.sign({ id: userId, purpose: "mfa" }, this.tokenSecret(), { expiresIn: "5m" });
  }

  public static verifyLoginToken(token: string): string | null {
    try {
      const decoded: any = jwt.verify(token || "", this.tokenSecret(), { algorithms: ["HS256"] });
      return decoded?.purpose === "mfa" && decoded.id ? decoded.id : null;
    } catch {
      return null;
    }
  }

  public static encryptSecret(secret: string) { return EncryptionHelper.encrypt(secret); }
  public static decryptSecret(stored: string) { return EncryptionHelper.decrypt(stored); }

  public static generateBackupCodes(): { codes: string[]; hashes: string[] } {
    const codes: string[] = [];
    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
      let code = "";
      for (let j = 0; j < 10; j++) code += BACKUP_ALPHABET[crypto.randomInt(BACKUP_ALPHABET.length)];
      codes.push(code.slice(0, 5) + "-" + code.slice(5));
    }
    return { codes, hashes: codes.map((c) => this.hashBackupCode(c)) };
  }

  // Backup codes carry ~49 bits of randomness, so a plain SHA-256 is enough (no brute-forceable low-entropy input).
  public static hashBackupCode(code: string): string {
    const normalized = (code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return crypto.createHash("sha256").update(normalized).digest("hex");
  }

  /** Accepts a current authenticator code or an unused backup code for a user with 2FA enabled. */
  public static async verifyCode(repos: Repos, userId: string, code: string): Promise<boolean> {
    const record = await repos.userMfa.load(userId);
    if (!record?.enabled) return false;

    const step = TotpHelper.matchStep(this.decryptSecret(record.secret), code);
    if (step !== null) return repos.userMfa.claimStep(userId, step);

    const hashes: string[] = JSON.parse(record.backupCodes || "[]");
    const hash = this.hashBackupCode(code);
    if (!hashes.includes(hash)) return false;
    const remaining = JSON.stringify(hashes.filter((h) => h !== hash));
    return repos.userMfa.replaceBackupCodes(userId, record.backupCodes, remaining);
  }
}
