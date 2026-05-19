import { CustomAuthProvider as BaseAuthProvider, Principal } from "@churchapps/apihelper";
import { Environment } from "../helpers/Environment.js";
import { Repos } from "../../modules/membership/repositories/index.js";
import { UserHelper } from "../../modules/membership/helpers/index.js";
import { buildPermStrings } from "../auth/buildPermStrings.js";
import { filterPermissionsByScopes, parseScopes } from "../auth/Scopes.js";
import crypto from "crypto";

/**
 * Shared CustomAuthProvider implementation for the monolith
 * Extends the base provider from @churchapps/apihelper with module-specific logic
 */
export class CustomAuthProvider extends BaseAuthProvider {
  /**
   * Constructor for CustomAuthProvider
   */
  constructor() {
    super();
  }

  /**
   * Override to use consolidated environment configuration
   */
  protected getJwtSecret(): string {
    if (!Environment.jwtSecret) {
      console.error("🔴 CRITICAL: Environment.jwtSecret is not set when getJwtSecret() was called");
      console.error("🔴 This indicates a race condition during initialization");
      throw new Error("JWT secret not available - Environment may not be fully initialized");
    }
    return Environment.jwtSecret;
  }

  /**
   * Override to use consolidated JWT expiration setting
   */
  protected getJwtExpiration(): string {
    return Environment.jwtExpiration || "2 days";
  }

  /**
   * Module-specific authentication validation
   * This can be extended as modules are migrated to add specific auth rules
   */
  protected async validateModuleAccess(token: any, _moduleName?: string): Promise<boolean> {
    // Base validation - use the public validateToken method
    const isValid = await this.validateToken(token);
    if (!isValid) return false;

    // Add module-specific validation logic here as needed
    // For now, all authenticated users can access all modules
    // This can be refined during migration based on specific requirements

    return true;
  }

  /**
   * Get the appropriate membership API URL for auth validation
   */
  protected getMembershipApiUrl(): string {
    return Environment.membershipApi;
  }

  /**
   * Public method to validate token
   */
  async validateToken(token: any): Promise<boolean> {
    try {
      // Use the base class's validation logic if available
      // For now, implement basic JWT validation
      if (!token) return false;

      // Basic token structure validation
      if (typeof token === "string") {
        const parts = token.split(".");
        return parts.length === 3; // Basic JWT structure check
      }

      return !!token; // Assume token object is valid for now
    } catch (error) {
      console.error("Token validation error:", error);
      return false;
    }
  }

  /**
   * Required method for AuthProvider interface.
   *
   * `cak_`-prefixed bearer tokens are API keys — resolved here. Everything
   * else is a JWT (staff login or OAuth access token) and delegates to the
   * base provider unchanged. Both paths produce a Principal of the same
   * shape, so all downstream authorization stays a single mechanism.
   */
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

  /**
   * Resolves an API key (`cak_<prefix>.<secret>`) to a Principal. The key's
   * permissions are its person's CURRENT RBAC permissions, intersected with
   * the key's granted scopes — resolved fresh each request so the key can
   * never drift from RBAC and stays revocable. Returns null on any failure
   * (missing/expired key, bad secret, malformed token).
   */
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

      // Constant-time hash comparison.
      const actual = Buffer.from(crypto.createHash("sha256").update(secret).digest("hex"), "utf8");
      const expected = Buffer.from(key.hashedKey, "utf8");
      if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

      // Permissions, group membership, and person status are independent — resolve in parallel.
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
