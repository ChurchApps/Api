import { controller, httpPost, httpGet, requestParam, httpDelete } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { LoginUserChurch, OAuthClient, OAuthCode, OAuthToken, OAuthDeviceCode, OAuthRelaySession } from "../models/index.js";
import { Permissions, UniqueIdHelper, UserHelper } from "../helpers/index.js";
import { AuthenticatedUser } from "../auth/index.js";
import { OAuthDeviceCodeRepo, OAuthRelaySessionRepo } from "../repositories/index.js";
import { Environment } from "../../../shared/helpers/Environment.js";
import { parseScopes } from "../../../shared/auth/Scopes.js";
import { toConnections } from "../helpers/OAuthConnectionHelper.js";

@controller("/membership/oauth")
export class OAuthController extends MembershipBaseController {

  private async loadPersonAndGroups(personId: string): Promise<{ membershipStatus: string; groups: Array<{ id: string; tags: string; name: string; leader: boolean }> }> {
    const people = await this.repos.person.loadByIdsOnly([personId]);
    const person = people.length > 0 ? people[0] : null;
    const allGroups = await this.repos.groupMember.loadForPeople([personId]);

    const groups: Array<{ id: string; tags: string; name: string; leader: boolean }> = [];
    allGroups.forEach((g: any) => {
      groups.push({ id: g.groupId, tags: g.tags, name: g.name, leader: g.leader });
    });

    return {
      membershipStatus: person?.membershipStatus || "Guest",
      groups
    };
  }

  // authz-exempt: self-service — issues an auth code for the caller's own userChurch (loadByUserId(au.id, au.churchId)); user consents on their own behalf
  @httpPost("/authorize")
  public async authorize(req: express.Request<{}, {}, { client_id: string; redirect_uri: string; response_type: string; scope: string; state?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { client_id, redirect_uri, response_type, scope, state } = req.body;

      const client = (await this.repos.oAuthClient.loadByClientId(client_id)) as any;
      if (!client) return this.json({ error: "invalid_client" }, 400);
      if (!client.redirectUris?.includes(redirect_uri)) return this.json({ error: "invalid_redirect_uri" }, 400);
      if (response_type !== "code") return this.json({ error: "unsupported_response_type" }, 400);

      const userChurch = (await this.repos.userChurch.loadByUserId(au.id, au.churchId)) as any;

      const authCode: OAuthCode = {
        userChurchId: userChurch.id,
        clientId: client.clientId,
        code: UniqueIdHelper.shortId(),
        redirectUri: redirect_uri,
        scopes: scope,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      };
      await this.repos.oAuthCode.save(authCode);

      return this.json({
        code: authCode.code,
        state: state || null
      });
    });
  }

  @httpPost("/token")
  public async token(
    req: express.Request<
      {},
      {},
      {
        grant_type: string;
        code?: string;
        refresh_token?: string;
        device_code?: string;
        client_id: string;
        client_secret?: string;
        redirect_uri?: string;
      }
    >,
    res: express.Response
  ): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const { grant_type, code, refresh_token, device_code, client_id, client_secret, redirect_uri } = req.body;

      // Device code grant type doesn't require client_secret
      if (grant_type === "urn:ietf:params:oauth:grant-type:device_code") {
        return this.handleDeviceCodeGrant(device_code, client_id, res);
      }

      // Only public (secret-less) clients may omit client_secret on refresh_token grant; if client has a secret, it must match.
      let client;
      if (grant_type === "refresh_token" && !client_secret) {
        client = (await this.repos.oAuthClient.loadByClientId(client_id)) as any;
        if (client?.clientSecret) return this.json({ error: "invalid_client" }, 400);
      } else {
        client = (await this.repos.oAuthClient.loadByClientIdAndSecret(client_id, client_secret)) as any;
      }
      if (!client) return this.json({ error: "invalid_client" }, 400);

      if (grant_type === "authorization_code") {
        if (!code) return this.json({ error: "invalid_request" }, 400);
        const authCode = (await this.repos.oAuthCode.loadByCode(code)) as any;
        if (!authCode || authCode.clientId !== client.clientId) return this.json({ error: "invalid_grant" }, 400);
        if (redirect_uri && authCode.redirectUri !== redirect_uri) return this.json({ error: "invalid_grant" }, 400);

        if (authCode.expiresAt && authCode.expiresAt < new Date()) {
          await this.repos.oAuthCode.delete(authCode.id);
          return this.json({ error: "invalid_grant" }, 400);
        }

        const userChurch = (await this.repos.userChurch.load(authCode.userChurchId)) as any;
        const user = (await this.repos.user.load(userChurch.userId)) as any;
        const church = (await this.repos.church.loadById(userChurch.churchId)) as any;
        const personData = await this.loadPersonAndGroups(userChurch.personId);
        const loginUserChurch: LoginUserChurch = {
          church: { id: church.id, name: church.churchName, subDomain: church.subDomain },
          person: {
            id: userChurch.personId,
            membershipStatus: personData.membershipStatus,
            name: { first: "", last: "" }
          },
          groups: personData.groups,
          apis: []
        };

        loginUserChurch.apis = await UserHelper.loadExpandedPermissions(user.id, church.id, this.repos);

        // Refresh token expires in 90 days
        const token: OAuthToken = {
          clientId: client.clientId,
          userChurchId: authCode.userChurchId,
          accessToken: AuthenticatedUser.getCombinedApiJwt(user, loginUserChurch, "7 days", parseScopes(authCode.scopes)),
          refreshToken: UniqueIdHelper.shortId(),
          scopes: authCode.scopes,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
        };
        await this.repos.oAuthToken.save(token);

        await this.repos.oAuthCode.delete(authCode.id);

        return this.json({
          access_token: token.accessToken,
          token_type: "Bearer",
          expires_in: 7 * 24 * 3600, // 7 days (matches JWT expiration)
          created_at: Math.floor(Date.now() / 1000),
          refresh_token: token.refreshToken,
          scope: token.scopes
        });
      } else if (grant_type === "refresh_token") {
        if (!refresh_token) return this.json({ error: "invalid_request" }, 400);
        const oldToken = (await this.repos.oAuthToken.loadByRefreshToken(refresh_token)) as any;

        if (!oldToken || oldToken.clientId !== client.clientId) return this.json({ error: "invalid_grant" }, 400);

        // Fetch user/church data to generate proper JWT
        const userChurch = (await this.repos.userChurch.load(oldToken.userChurchId)) as any;
        const user = (await this.repos.user.load(userChurch.userId)) as any;
        const church = (await this.repos.church.loadById(userChurch.churchId)) as any;
        const personData = await this.loadPersonAndGroups(userChurch.personId);
        const loginUserChurch: LoginUserChurch = {
          church: { id: church.id, name: church.churchName, subDomain: church.subDomain },
          person: {
            id: userChurch.personId,
            membershipStatus: personData.membershipStatus,
            name: { first: "", last: "" }
          },
          groups: personData.groups,
          apis: []
        };

        loginUserChurch.apis = await UserHelper.loadExpandedPermissions(user.id, church.id, this.repos);

        // Refresh token expires in 90 days
        const token: OAuthToken = {
          clientId: client.clientId,
          userChurchId: oldToken.userChurchId,
          accessToken: AuthenticatedUser.getCombinedApiJwt(user, loginUserChurch, "7 days", parseScopes(oldToken.scopes)),
          refreshToken: UniqueIdHelper.shortId(),
          scopes: oldToken.scopes,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
        };
        await this.repos.oAuthToken.save(token);

        await this.repos.oAuthToken.delete(oldToken.id);

        return this.json({
          access_token: token.accessToken,
          token_type: "Bearer",
          created_at: Math.floor(Date.now() / 1000),
          expires_in: 7 * 24 * 3600, // 7 days (matches JWT expiration)
          refresh_token: token.refreshToken,
          scope: token.scopes
        });
      } else return this.json({ error: "unsupported_grant_type" }, 400);
    });
  }

  /** Device Authorization Request per RFC 8628 Section 3.1. */
  @httpPost("/device/authorize")
  public async deviceAuthorize(req: express.Request<{}, {}, { client_id: string; scope?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const { client_id, scope } = req.body;

      if (!client_id) {
        return this.json({ error: "invalid_request", error_description: "client_id required" }, 400);
      }

      const client = await this.repos.oAuthClient.loadByClientId(client_id);
      if (!client) {
        return this.json({ error: "invalid_client" }, 400);
      }

      const deviceCode = OAuthDeviceCodeRepo.generateDeviceCode();
      const userCode = OAuthDeviceCodeRepo.generateUserCode();

      // 15 minutes per RFC recommendation
      const expiresIn = 900; // seconds
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      const dc: OAuthDeviceCode = {
        deviceCode,
        userCode,
        clientId: client_id,
        scopes: scope || "content offline_access",
        expiresAt,
        pollInterval: 5,
        status: "pending"
      };
      await this.repos.oAuthDeviceCode.save(dc);

      // Return per RFC 8628 Section 3.2
      return this.json({
        device_code: deviceCode,
        user_code: userCode,
        verification_uri: `${Environment.b1AdminRoot}/device`,
        verification_uri_complete: `${Environment.b1AdminRoot}/device?code=${userCode}`,
        expires_in: expiresIn,
        interval: 5
      });
    });
  }

  /** Handle device_code grant type (called from /token endpoint). */
  private async handleDeviceCodeGrant(deviceCode: string, clientId: string, _res: express.Response): Promise<any> {
    if (!deviceCode) {
      return this.json({ error: "invalid_request", error_description: "device_code required" }, 400);
    }

    const dc = await this.repos.oAuthDeviceCode.loadByDeviceCode(deviceCode);

    if (!dc || dc.clientId !== clientId) {
      return this.json({ error: "invalid_grant" }, 400);
    }

    if (new Date() > dc.expiresAt) {
      dc.status = "expired";
      await this.repos.oAuthDeviceCode.save(dc);
      return this.json({ error: "expired_token" }, 400);
    }

    switch (dc.status) {
      case "pending": return this.json({ error: "authorization_pending" }, 400);
      case "denied":
        await this.repos.oAuthDeviceCode.delete(dc.id);
        return this.json({ error: "access_denied" }, 400);
      case "approved":
        // Generate tokens using the stored userChurchId
        const userChurch = (await this.repos.userChurch.load(dc.userChurchId)) as any;
        if (!userChurch) {
          return this.json({ error: "server_error" }, 500);
        }

        const user = (await this.repos.user.load(userChurch.userId)) as any;
        const church = (await this.repos.church.loadById(userChurch.churchId)) as any;
        const personData = await this.loadPersonAndGroups(userChurch.personId);

        if (!user || !church) {
          return this.json({ error: "server_error" }, 500);
        }

        const loginUserChurch: LoginUserChurch = {
          church: { id: church.id, name: church.churchName, subDomain: church.subDomain },
          person: {
            id: userChurch.personId,
            membershipStatus: personData.membershipStatus,
            name: { first: "", last: "" }
          },
          groups: personData.groups,
          apis: []
        };

        loginUserChurch.apis = await UserHelper.loadExpandedPermissions(user.id, church.id, this.repos);

        const accessToken = AuthenticatedUser.getCombinedApiJwt(user, loginUserChurch, "7 days", parseScopes(dc.scopes));
        const refreshToken = UniqueIdHelper.shortId();

        // Refresh token expires in 90 days
        const token: OAuthToken = {
          clientId: dc.clientId,
          userChurchId: dc.userChurchId,
          accessToken,
          refreshToken,
          scopes: dc.scopes,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
        };
        await this.repos.oAuthToken.save(token);

        await this.repos.oAuthDeviceCode.delete(dc.id);

        return this.json({
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: 7 * 24 * 3600, // 7 days (matches JWT expiration)
          refresh_token: refreshToken,
          scope: dc.scopes
        });

      default:
        return this.json({ error: "server_error" }, 500);
    }
  }

  /** Get pending device code info for admin approval UI. */
  @httpGet("/device/pending/:userCode")
  public async getPendingDevice(@requestParam("userCode") userCode: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (_au) => {
      const dc = await this.repos.oAuthDeviceCode.loadByUserCode(userCode);

      if (!dc) {
        return this.json({ error: "not_found" }, 404);
      }

      // Return limited info for security
      return this.json({
        userCode: dc.userCode,
        clientId: dc.clientId,
        scopes: dc.scopes,
        expiresIn: Math.max(0, Math.floor((dc.expiresAt.getTime() - Date.now()) / 1000))
      });
    });
  }

  /** Approve device authorization (called from admin UI). */
  @httpPost("/device/approve")
  public async approveDevice(req: express.Request<{}, {}, { user_code: string; church_id: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { user_code, church_id } = req.body;

      const dc = await this.repos.oAuthDeviceCode.loadByUserCode(user_code);

      if (!dc) {
        return this.json({ error: "invalid_code", message: "Code not found or expired" }, 400);
      }

      // Verify user has access to the selected church
      const userChurch = (await this.repos.userChurch.loadByUserId(au.id, church_id)) as any;
      if (!userChurch) {
        return this.json({ error: "access_denied", message: "No access to selected church" }, 403);
      }

      // Approve the device code
      dc.status = "approved";
      dc.approvedByUserId = au.id;
      dc.userChurchId = userChurch.id;
      dc.churchId = church_id;
      await this.repos.oAuthDeviceCode.save(dc);

      return this.json({ success: true, message: "Device authorized successfully" });
    });
  }

  /** Deny device authorization. */
  // authz-exempt: open to any authenticated user — only marks a pending device code "denied" (blocks pairing); no data access or escalation, holder of the on-screen user_code may decline
  @httpPost("/device/deny")
  public async denyDevice(req: express.Request<{}, {}, { user_code: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (_au) => {
      const { user_code } = req.body;

      const dc = await this.repos.oAuthDeviceCode.loadByUserCode(user_code);

      if (!dc) {
        return this.json({ error: "invalid_code" }, 400);
      }

      dc.status = "denied";
      await this.repos.oAuthDeviceCode.save(dc);

      return this.json({ success: true });
    });
  }

  /** Create relay session for external OAuth providers; TV app receives sessionCode to poll for auth code. */
  @httpPost("/relay/sessions")
  public async createRelaySession(req: express.Request<{}, {}, { provider: string }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const { provider } = req.body;
      if (!provider) {
        return this.json({ error: "invalid_request", error_description: "provider is required" }, 400);
      }

      const sessionCode = OAuthRelaySessionRepo.generateSessionCode();
      const expiresIn = 900; // 15 minutes
      const expiresAt = new Date(Date.now() + expiresIn * 1000);
      const redirectUri = `${Environment.membershipApi}/oauth/relay/callback`;

      const session: OAuthRelaySession = {
        sessionCode,
        provider,
        redirectUri,
        status: "pending",
        expiresAt
      };
      await this.repos.oAuthRelaySession.save(session);

      return this.json({
        sessionCode,
        redirectUri,
        expiresIn,
        interval: 5
      });
    });
  }

  /** Poll relay session for auth code; returns "pending" or "completed" with authCode. */
  @httpGet("/relay/sessions/:sessionCode")
  public async getRelaySession(@requestParam("sessionCode") sessionCode: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const session = await this.repos.oAuthRelaySession.loadBySessionCode(sessionCode);
      if (!session) {
        return this.json({ error: "not_found" }, 404);
      }

      if (session.status === "completed" && session.authCode) {
        // Return the code and clean up
        const authCode = session.authCode;
        await this.repos.oAuthRelaySession.delete(session.id);
        return this.json({ status: "completed", authCode });
      }

      return this.json({
        status: session.status,
        expiresIn: Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000))
      });
    });
  }

  /** OAuth callback from external provider; stores code and shows HTML confirmation. */
  @httpGet("/relay/callback")
  public async relayCallback(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const code = req.query.code as string;
      const sessionCode = req.query.state as string;
      const error = req.query.error as string;

      if (error) {
        res.setHeader("Content-Type", "text/html");
        return res.send(this.relayCallbackHtml("Authorization Error", `The provider returned an error: ${error}. You can close this page.`));
      }

      if (!code || !sessionCode) {
        res.setHeader("Content-Type", "text/html");
        return res.send(this.relayCallbackHtml("Error", "Missing authorization code or session. Please try again from your TV."));
      }

      const session = await this.repos.oAuthRelaySession.loadBySessionCode(sessionCode);
      if (!session) {
        res.setHeader("Content-Type", "text/html");
        return res.send(this.relayCallbackHtml("Session Expired", "This authorization session has expired. Please try again from your TV."));
      }

      session.authCode = code;
      session.status = "completed";
      await this.repos.oAuthRelaySession.save(session);

      res.setHeader("Content-Type", "text/html");
      return res.send(this.relayCallbackHtml("Success!", "Authorization complete. You can close this page and return to your TV."));
    });
  }

  private relayCallbackHtml(title: string, message: string): string {
    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#1a0f17;color:#fff}
.card{text-align:center;padding:40px;border-radius:12px;background:rgba(255,255,255,0.05);max-width:400px}
h1{font-size:24px;margin-bottom:16px}p{color:rgba(255,255,255,0.7);line-height:1.5}</style>
</head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
  }

  // Connected Apps screen in B1Admin Settings
  @httpGet("/connections")
  public async getConnections(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const userChurch = (await this.repos.userChurch.loadByUserId(au.id, au.churchId)) as any;
      if (!userChurch) return [];
      return toConnections(await this.repos.oAuthToken.loadForUser(userChurch.id));
    });
  }

  // Token can only be revoked by the user it belongs to
  @httpDelete("/connections/:id")
  public async deleteConnection(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const token = (await this.repos.oAuthToken.load(id)) as any;
      if (!token) return this.json({}, 404);
      const userChurch = (await this.repos.userChurch.loadByUserId(au.id, au.churchId)) as any;
      if (!userChurch || token.userChurchId !== userChurch.id) return this.json({}, 403);
      await this.repos.oAuthToken.delete(id);
      return this.json({}, 200);
    });
  }

  @httpGet("/clients")
  public async getClients(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      return await this.repos.oAuthClient.loadAll();
    });
  }

  @httpGet("/clients/clientId/:clientId")
  public async getClientByClientId(@requestParam("clientId") clientId: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (_au) => {
      const result = (await this.repos.oAuthClient.loadByClientId(clientId)) as any;
      result.clientSecret = null;
      return result;
    });
  }

  @httpGet("/clients/:id")
  public async getClient(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      return await this.repos.oAuthClient.load(id);
    });
  }

  @httpPost("/clients")
  public async saveClient(req: express.Request<{}, {}, OAuthClient>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      return await this.repos.oAuthClient.save(req.body);
    });
  }

  @httpDelete("/clients/:id")
  public async deleteClient(@requestParam("id") id: string, req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      await this.repos.oAuthClient.delete(id);
      return this.json({}, 200);
    });
  }
}
