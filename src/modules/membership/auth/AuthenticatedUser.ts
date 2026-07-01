import { Principal, AuthenticatedUser as BaseAuthenticatedUser } from "@churchapps/apihelper";
import { Api, LoginResponse, LoginUserChurch, User } from "../models/index.js";
import jwt, { SignOptions, JwtPayload } from "jsonwebtoken";
import { Repos } from "../repositories/index.js";
import { Environment } from "../helpers/index.js";
import { buildPermStrings } from "../../../shared/auth/buildPermStrings.js";
import { filterPermissionsByScopes } from "../../../shared/auth/Scopes.js";

export class AuthenticatedUser extends BaseAuthenticatedUser {
  public static async login(allUserChurches: LoginUserChurch[], user: User) {
    const userChurches = [...allUserChurches];
    if (userChurches.length > 1 && userChurches[0].church.id === "") userChurches.splice(0, 1); // remove empty church with universal permissions if there are actual church records.

    // if (churches.length === 0) return null;
    // else {
    AuthenticatedUser.setJwt(userChurches, user);
    const result: LoginResponse = {
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        id: user.id,
        jwt: AuthenticatedUser.getUserJwt(user)
      },
      userChurches: userChurches
    };
    return result;
    // }
  }

  public static getApiJwt(api: Api, user: User, userChurch: LoginUserChurch) {
    // Monolith: every token carries the full cross-module permission set (minus the
    // apiName-prefixed ReportingApi duplicates) so a permission from any module is
    // honored on any module's endpoints — no request-time cross-API fallback needed.
    const permList = buildPermStrings(userChurch.apis?.filter((a) => a.keyName !== "ReportingApi"));

    const groupIds: string[] = [];
    userChurch.groups?.forEach((g) => groupIds.push(g.id));
    const leaderGroupIds: string[] = [];
    userChurch.groups?.forEach((g) => { if (g.leader) leaderGroupIds.push(g.id); });
    const options: SignOptions = { expiresIn: Environment.jwtExpiration as any };
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        churchId: userChurch.church.id,
        personId: userChurch.person.id,
        apiName: api.keyName,
        permissions: permList,
        groupIds,
        leaderGroupIds,
        membershipStatus: userChurch.person?.membershipStatus
      },
      Environment.jwtSecret,
      options
    );
  }

  public static getChurchJwt(user: User, userChurch: LoginUserChurch) {
    const permList = buildPermStrings(userChurch.apis);

    const groupIds: string[] = [];
    userChurch.groups?.forEach((g) => groupIds.push(g.id));
    const leaderGroupIds: string[] = [];
    userChurch.groups?.forEach((g) => { if (g.leader) leaderGroupIds.push(g.id); });
    const options: SignOptions = { expiresIn: Environment.jwtExpiration as any };
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        churchId: userChurch.church.id,
        personId: userChurch.person.id,
        permissions: permList,
        groupIds,
        leaderGroupIds,
        membershipStatus: userChurch.person?.membershipStatus
      },
      Environment.jwtSecret,
      options
    );
  }

  /**
   * Mints the JWT used as an OAuth access token. When `scopes` is supplied
   * (a non-empty list), the permission array is filtered down to what those
   * scopes allow *before signing* — the token then carries an already-reduced
   * permission set, so no request-time scope check is ever needed. Absent or
   * empty scopes leave the full permission set (backward compatible).
   */
  public static getCombinedApiJwt(user: User, userChurch: LoginUserChurch, expiresIn?: string, scopes?: string[]) {
    const permList = filterPermissionsByScopes(buildPermStrings(userChurch.apis), scopes ?? []);

    const groupIds: string[] = [];
    userChurch.groups?.forEach((g) => groupIds.push(g.id));
    const leaderGroupIds: string[] = [];
    userChurch.groups?.forEach((g) => { if (g.leader) leaderGroupIds.push(g.id); });

    const options: SignOptions = { expiresIn: (expiresIn || Environment.jwtExpiration) as any };
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        churchId: userChurch.church.id,
        personId: userChurch.person.id,
        permissions: permList,
        groupIds,
        leaderGroupIds,
        membershipStatus: userChurch.person?.membershipStatus
      },
      Environment.jwtSecret,
      options
    );
  }

  public static getUserJwt(user: User) {
    return jwt.sign({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName }, Environment.jwtSecret, { expiresIn: "180 days" });
  }

  public static setJwt(allUserChurches: LoginUserChurch[], user: User) {
    allUserChurches.forEach((uc) => {
      uc.apis?.forEach((api) => {
        api.jwt = AuthenticatedUser.getApiJwt(api, user, uc);
        if (api.keyName === "ReportingApi") api.permissions = []; // We just need the jwt, not the list
      });
      uc.jwt = AuthenticatedUser.getChurchJwt(user, uc);
    });
  }

  public static async loadUserByJwt(token: string, repos: Repos) {
    let result: User = null;
    try {
      const decoded = jwt.verify(token, Environment.jwtSecret);
      if (typeof decoded === "string") {
        throw new Error("Invalid token format");
      }
      const principal = new Principal(decoded as JwtPayload);
      const userId: string = principal.details.id;
      result = await repos.user.load(userId);
    } catch {
      // JWT verification failed - user not found
    }
    return result;
  }
}
