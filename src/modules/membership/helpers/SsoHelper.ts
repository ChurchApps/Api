import fs from "fs";
import path from "path";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { v4 } from "uuid";
import jwt from "jsonwebtoken";
import { FileStorageHelper, AwsHelper } from "@churchapps/apihelper";
import { Environment } from "../../../shared/helpers/Environment.js";
import { InternalEventBus } from "../../../shared/events/InternalEventBus.js";
import { UserChurchHelper } from "./UserChurchHelper.js";
import type { Repos } from "../repositories/index.js";
import type { User, Person } from "../models/index.js";

export interface ProviderConfig {
  id: "google" | "microsoft";
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
}

interface StatePayload {
  returnUrl: string;
  nonce: string;
}

const CONSUMER_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";
const STATE_TTL = "10m";

export class SsoHelper {
  public static getProviderConfig(provider: string): ProviderConfig | null {
    if (provider === "google") {
      if (!Environment.googleSsoClientId || !Environment.googleSsoClientSecret) return null;
      return {
        id: "google",
        clientId: Environment.googleSsoClientId,
        clientSecret: Environment.googleSsoClientSecret,
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scope: "openid email profile"
      };
    }
    if (provider === "microsoft") {
      if (!Environment.microsoftSsoClientId || !Environment.microsoftSsoClientSecret) return null;
      return {
        id: "microsoft",
        clientId: Environment.microsoftSsoClientId,
        clientSecret: Environment.microsoftSsoClientSecret,
        authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        scope: "openid email profile User.Read"
      };
    }
    return null;
  }

  public static configuredProviders(): string[] {
    return ["google", "microsoft"].filter((p) => this.getProviderConfig(p) !== null);
  }

  public static redirectUri(provider: string): string {
    return `${Environment.membershipApi}/users/sso/callback/${provider}`;
  }

  // returnUrl must be an http(s) URL whose host is trusted: localhost, *.b1.church,
  // or a configured SSO_ALLOWED_ORIGINS entry. The church domains table is deliberately
  // NOT trusted here — it accepts unverified domains, so it could exfiltrate login JWTs.
  public static async validateReturnUrl(returnUrl: string): Promise<boolean> {
    if (!returnUrl) return false;
    let url: URL;
    try {
      url = new URL(returnUrl);
    } catch {
      return false;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;

    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (host === "b1.church" || host.endsWith(".b1.church")) return true;

    const allowed = (Environment.ssoAllowedOrigins || "")
      .split(",")
      .map((o) => o.trim().toLowerCase())
      .filter((o) => o.length > 0);
    if (allowed.includes(url.origin.toLowerCase()) || allowed.includes(host)) return true;

    return false;
  }

  public static createState(returnUrl: string): string {
    const payload: StatePayload = { returnUrl, nonce: crypto.randomUUID() };
    return jwt.sign(payload, Environment.jwtSecret, { expiresIn: STATE_TTL });
  }

  public static verifyState(token: string): StatePayload | null {
    if (!token) return null;
    try {
      const decoded = jwt.verify(token, Environment.jwtSecret);
      if (typeof decoded === "string") return null;
      const { returnUrl, nonce } = decoded as any;
      if (!returnUrl || !nonce) return null;
      return { returnUrl, nonce };
    } catch {
      return null;
    }
  }

  public static buildAuthorizeUrl(cfg: ProviderConfig, state: string, nonce: string): string {
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      response_type: "code",
      redirect_uri: this.redirectUri(cfg.id),
      scope: cfg.scope,
      state,
      nonce
    });
    return `${cfg.authorizeUrl}?${params.toString()}`;
  }

  public static async exchangeCodeForTokens(cfg: ProviderConfig, code: string): Promise<{ id_token: string; access_token?: string }> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: this.redirectUri(cfg.id)
    });
    const res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString()
    });
    if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
    const json = (await res.json()) as any;
    if (!json.id_token) throw new Error("No id_token in token response");
    return { id_token: json.id_token, access_token: json.access_token };
  }

  // Enforces provider-specific email trust so an unverified or spoofable address
  // never becomes a login identity. Returns the normalized email on success.
  public static checkEmailTrust(provider: string, claims: any): { ok: boolean; email?: string; reason?: string } {
    const rawEmail: string = claims.email || claims.preferred_username || "";
    const email = rawEmail.trim().toLowerCase();
    if (!email) return { ok: false, reason: "No email address was provided by the identity provider." };

    if (provider === "google") {
      if (claims.email_verified === true || claims.email_verified === "true") return { ok: true, email };
      return { ok: false, reason: "Your Google email address is not verified. Please sign in with email and password." };
    }

    // Microsoft: multi-tenant AAD emails are spoofable unless the tenant is the
    // consumer tenant or the verified-email optional claim (xms_edov) is present.
    if (claims.tid === CONSUMER_TENANT) return { ok: true, email };
    if (claims.xms_edov === true || claims.xms_edov === "true") {
      // xms_edov only vouches for the `email` claim, not the preferred_username (UPN).
      const verifiedEmail = String(claims.email || "").trim().toLowerCase();
      if (!verifiedEmail) return { ok: false, reason: "Your organization's email could not be verified. Please sign in with email and password." };
      return { ok: true, email: verifiedEmail };
    }
    return { ok: false, reason: "Your organization's email could not be verified. Please sign in with email and password." };
  }

  public static extractNames(claims: any): { firstName: string; lastName: string } {
    let firstName: string = claims.given_name || "";
    let lastName: string = claims.family_name || "";
    if (!firstName && !lastName && claims.name) {
      const parts = String(claims.name).trim().split(/\s+/);
      firstName = parts.shift() || "";
      lastName = parts.join(" ");
    }
    return { firstName, lastName };
  }

  // Finds the user by email or creates one exactly like /register (random bcrypt
  // password, registrationDate, matching-people userChurch links) — but with no
  // verification code, since the identity provider already verified the email.
  public static async findOrCreateUser(email: string, firstName: string, lastName: string, repos: Repos): Promise<{ user: User; isNew: boolean }> {
    const normalized = email.trim().toLowerCase();
    let user = await repos.user.loadByEmail(normalized);
    if (user) return { user, isNew: false };

    user = { email: normalized, firstName, lastName };
    user.authGuid = v4();
    user.registrationDate = new Date();
    user.password = bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 10);
    user = await repos.user.save(user);
    await UserChurchHelper.createForNewUser(user.id, user.email);
    return { user, isNew: true };
  }

  public static async fetchProviderPhoto(provider: string, claims: any, accessToken?: string): Promise<string | null> {
    try {
      if (provider === "google") {
        let pictureUrl: string = claims.picture || "";
        if (!pictureUrl) return null;
        if (pictureUrl.includes("=s96-c")) pictureUrl = pictureUrl.replace("=s96-c", "=s400-c");
        const res = await fetch(pictureUrl);
        if (!res.ok) return null;
        return await this.toDataUrl(res);
      }
      if (provider === "microsoft") {
        if (!accessToken) return null;
        const headers = { Authorization: `Bearer ${accessToken}` };
        let res = await fetch("https://graph.microsoft.com/v1.0/me/photos/240x240/$value", { headers });
        if (res.status === 404) res = await fetch("https://graph.microsoft.com/v1.0/me/photo/$value", { headers });
        if (!res.ok) return null;
        return await this.toDataUrl(res);
      }
    } catch {
      // photo import is best-effort; never block login on it
    }
    return null;
  }

  private static readonly MAX_PHOTO_BYTES = 2 * 1024 * 1024;

  private static async toDataUrl(res: Response): Promise<string | null> {
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) return null;
    if (Number(res.headers.get("content-length") || "0") > this.MAX_PHOTO_BYTES) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > this.MAX_PHOTO_BYTES) return null;
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  }

  // Requests a staff-approval directoryUpdate photo task for each of the user's people
  // that have no photo yet, via the internal event bus (the doing module subscribes and
  // runs the same submission pipeline as member self-service). When the user has no person
  // at all, stashes the photo so PersonHelper.claim can apply it on church select.
  public static async importPhoto(provider: string, claims: any, accessToken: string | undefined, user: User, repos: Repos): Promise<void> {
    try {
      const dataUrl = await this.fetchProviderPhoto(provider, claims, accessToken);
      if (!dataUrl) return;

      const userChurches = await repos.userChurch.loadForUser(user.id);
      const withPerson = userChurches.filter((uc: any) => uc.personId);
      if (withPerson.length === 0) {
        await this.stashPhoto(user.id, dataUrl);
        return;
      }

      for (const uc of withPerson) {
        const churchId = uc.church?.id || uc.churchId;
        const person = (await repos.person.load(churchId, uc.personId)) as Person;
        if (!person || person.photoUpdated) continue;
        await this.publishPhotoSubmission(churchId, uc.personId, dataUrl, repos);
      }
    } catch (e) {
      console.error("SSO photo import failed:", e);
    }
  }

  // Applies a previously stashed SSO photo to a freshly-created/claimed person.
  public static async applyStashedPhoto(userId: string, churchId: string, person: Person, repos: Repos): Promise<void> {
    try {
      if (!person || person.photoUpdated) return;
      const dataUrl = await this.readStashedPhoto(userId);
      if (!dataUrl) return;
      await this.publishPhotoSubmission(churchId, person.id, dataUrl, repos);
      await this.removeStashedPhoto(userId);
    } catch (e) {
      console.error("SSO stashed photo apply failed:", e);
    }
  }

  private static async publishPhotoSubmission(churchId: string, personId: string, dataUrl: string, repos: Repos): Promise<void> {
    const assignedTo = await this.getApprovalAssignment(churchId, repos);
    await InternalEventBus.publish(churchId, "sso.photoSubmitted", { personId, dataUrl, assignedTo });
  }

  private static async getApprovalAssignment(churchId: string, repos: Repos): Promise<{ type: string; id: string } | undefined> {
    const settings = await repos.setting.loadAll(churchId);
    const setting = settings.find((s: any) => s.keyName === "directoryApprovalGroupId");
    return setting?.value ? { type: "group", id: setting.value } : undefined;
  }

  private static stashKey(userId: string): string {
    return "sso-photos/" + userId + ".txt";
  }

  private static async stashPhoto(userId: string, dataUrl: string): Promise<void> {
    await FileStorageHelper.store(this.stashKey(userId), "text/plain", Buffer.from(dataUrl, "utf8"));
  }

  private static async readStashedPhoto(userId: string): Promise<string | null> {
    const key = this.stashKey(userId);
    try {
      if (Environment.fileStore === "S3") return await AwsHelper.S3Read(key);
      const filePath = path.resolve("./content") + "/" + key;
      if (!fs.existsSync(filePath)) return null;
      return fs.readFileSync(filePath, "utf8");
    } catch {
      return null;
    }
  }

  private static async removeStashedPhoto(userId: string): Promise<void> {
    try {
      await FileStorageHelper.remove(this.stashKey(userId));
    } catch {
      // ponytail: stash removal is best-effort; a leftover text file is harmless
    }
  }

  public static appendParam(returnUrl: string, key: string, value: string): string {
    const separator = returnUrl.includes("?") ? "&" : "?";
    return returnUrl + separator + key + "=" + encodeURIComponent(value);
  }

  // Delivers the token/error in the URL fragment so it is never sent to a server
  // or leaked via Referer / access logs.
  public static appendFragment(returnUrl: string, key: string, value: string): string {
    const separator = returnUrl.includes("#") ? "&" : "#";
    return returnUrl + separator + key + "=" + encodeURIComponent(value);
  }

  public static readCookie(header: string | undefined, name: string): string | null {
    if (!header) return null;
    for (const part of header.split(";")) {
      const idx = part.indexOf("=");
      if (idx === -1) continue;
      if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
    }
    return null;
  }
}
