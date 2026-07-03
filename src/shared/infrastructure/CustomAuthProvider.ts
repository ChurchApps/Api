import { CustomAuthProvider as BaseAuthProvider, Principal } from "@churchapps/apihelper";
import { Environment } from "../helpers/Environment.js";
import { Repos } from "../../modules/membership/repositories/index.js";
import { UserHelper } from "../../modules/membership/helpers/index.js";
import { buildPermStrings } from "../auth/buildPermStrings.js";
import { filterPermissionsByScopes, parseScopes } from "../auth/Scopes.js";
import crypto from "crypto";

/** CustomAuthProvider for monolith with module-specific logic. */
export class CustomAuthProvider extends BaseAuthProvider {
  constructor() {
    super();
  }

  protected getJwtSecret(): string {
    if (!Environment.jwtSecret) {
      console.error("🔴 CRITICAL: Environment.jwtSecret is not set when getJwtSecret() was called");
      console.error("🔴 This indicates a race condition during initialization");
      throw new Error("JWT secret not available - Environment may not be fully initialized");
    }
    return Environment.jwtSecret;
  }

  protected getJwtExpiration(): string {
    return Environment.jwtExpiration || "2 days";
  }

  protected async validateModuleAccess(token: any, _moduleName?: string): Promise<boolean> {
    const isValid = await this.validateToken(token);
    return isValid;
  }

  protected getMembershipApiUrl(): string {
    return Environment.membershipApi;
  }

  async validateToken(token: any): Promise<boolean> {
    try {
      if (!token) return false;
      if (typeof token === "string") {
        const parts = token.split(".");
        return parts.length === 3;
      }
      return !!token;
    } catch (error) {
      console.error("Token validation error:", error);
      return false;
    }
  }

  // cak_ tokens are API keys; everything else delegates to base (JWT).
  async getUser(req: any, res: any, next: any): Promise<any> {
    try {
      const authHeader = req.headers?.authorization;
      const token = authHeader ? authHeader.split(" ")[1] : null;
      if (token && token.startsWith("cak_")) {
        return await this.getUserFromApiKey(token);
      }
      return await super.getUser(req, res, next);
    } catch {
      // jwt.verify throws on an invalid/expired token — treat as unauthenticated.
      return null;
    }
  }

  // Resolves cak_<prefix>.<secret> to Principal; fresh RBAC intersection per request keeps key revocable.
  private async getUserFromApiKey(token: string): Promise<Principal> {
    try {
      const body = token.substring(4);
      const dotIdx = body.indexOf(".");
      if (dotIdx < 1 || dotIdx === body.length - 1) return null;
      const prefix = body.substring(0, dotIdx);
      const secret = body.substring(dotIdx + 1);

      const repos = Repos.getCurrent();
      const key = await repos.apiKey.loadByPrefix(prefix);
      if (!key || !key.hashedKey) return null;
      if (key.expiresAt && new Date(key.expiresAt) < new Date()) return null;

      // Constant-time hash comparison (prevents timing attacks).
      const actual = Buffer.from(crypto.createHash("sha256").update(secret).digest("hex"), "utf8");
      const expected = Buffer.from(key.hashedKey, "utf8");
      if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

      const [apis, groupMembers, people] = await Promise.all([
        UserHelper.loadExpandedPermissions(key.userId, key.churchId, repos),
        repos.groupMember.loadForPeople([key.personId]),
        repos.person.loadByIdsOnly([key.personId])
      ]);
      const permissions = filterPermissionsByScopes(buildPermStrings(apis), parseScopes(key.scopes));

      const groupIds: string[] = [];
      const leaderGroupIds: string[] = [];
      groupMembers.forEach((g: any) => {
        groupIds.push(g.groupId);
        if (g.leader) leaderGroupIds.push(g.groupId);
      });
      const membershipStatus = people.length > 0 ? (people[0].membershipStatus || "") : "";

      // Throttled, fire-and-forget — never blocks or fails the request.
      repos.apiKey.touchLastUsed(key.id).catch(() => {});

      return new Principal({
        jwt: "",
        id: key.userId,
        churchId: key.churchId,
        personId: key.personId,
        permissions,
        apiName: "",
        email: "",
        firstName: "",
        lastName: "",
        membershipStatus,
        groupIds,
        leaderGroupIds
      });
    } catch (error) {
      console.error("API key authentication error:", error);
      return null;
    }
  }
}
