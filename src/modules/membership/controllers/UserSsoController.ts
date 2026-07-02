import { controller, httpGet, requestParam } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { AuthenticatedUser } from "../auth/index.js";
import { SsoHelper } from "../helpers/SsoHelper.js";
import { SsoTokenHelper } from "../helpers/SsoTokenHelper.js";
import { AuditLogHelper, Environment } from "../helpers/index.js";

@controller("/membership/users/sso")
export class UserSsoController extends MembershipBaseController {
  @httpGet("/providers")
  public async getProviders(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      return this.json(SsoHelper.configuredProviders(), 200);
    });
  }

  @httpGet("/authorize/:provider")
  public async authorize(@requestParam("provider") provider: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const cfg = SsoHelper.getProviderConfig(provider);
      if (!cfg) return res.status(400).send("Unknown or unconfigured provider");

      const returnUrl = (req.query.returnUrl as string) || "";
      if (!(await SsoHelper.validateReturnUrl(returnUrl))) return res.status(400).send("Invalid returnUrl");

      const state = SsoHelper.createState(returnUrl);
      const nonce = SsoHelper.verifyState(state)!.nonce;
      res.cookie("sso_state", nonce, {
        httpOnly: true,
        sameSite: "lax",
        secure: Environment.currentEnvironment !== "dev",
        maxAge: 10 * 60 * 1000,
        path: "/"
      });
      return res.redirect(302, SsoHelper.buildAuthorizeUrl(cfg, state, nonce));
    });
  }

  @httpGet("/callback/:provider")
  public async callback(@requestParam("provider") provider: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const state = req.query.state as string;
      const code = req.query.code as string;

      const statePayload = SsoHelper.verifyState(state);
      if (!statePayload) return res.status(400).send("Invalid or expired state");

      const returnUrl = statePayload.returnUrl;
      if (!(await SsoHelper.validateReturnUrl(returnUrl))) return res.status(400).send("Invalid returnUrl");

      // Bind the flow to this browser session: the state nonce must match the cookie set at authorize.
      const cookieNonce = SsoHelper.readCookie(req.headers.cookie, "sso_state");
      res.clearCookie("sso_state", { path: "/" });
      if (!cookieNonce || cookieNonce !== statePayload.nonce) return res.redirect(302, SsoHelper.appendFragment(returnUrl, "loginError", "Login session expired. Please try again."));

      try {
        const cfg = SsoHelper.getProviderConfig(provider);
        if (!cfg) return res.redirect(302, SsoHelper.appendFragment(returnUrl, "loginError", "Unknown provider"));
        if (!code) return res.redirect(302, SsoHelper.appendFragment(returnUrl, "loginError", "Missing authorization code"));

        const tokens = await SsoHelper.exchangeCodeForTokens(cfg, code);
        const claims = await SsoTokenHelper.verifyIdToken(cfg.id, tokens.id_token, statePayload.nonce, cfg.clientId);

        const trust = SsoHelper.checkEmailTrust(cfg.id, claims);
        if (!trust.ok) return res.redirect(302, SsoHelper.appendFragment(returnUrl, "loginError", trust.reason || "Login failed"));

        const { firstName, lastName } = SsoHelper.extractNames(claims);
        const { user } = await SsoHelper.findOrCreateUser(trust.email, firstName, lastName, this.repos);

        user.lastLogin = new Date();
        await this.repos.user.save(user);
        const ip = AuditLogHelper.getClientIp(req);
        AuditLogHelper.logLogin(this.repos, "", user.id, true, ip, { email: user.email, method: "sso:" + cfg.id });

        await SsoHelper.importPhoto(cfg.id, claims, tokens.access_token, user, this.repos);

        const token = AuthenticatedUser.getUserJwt(user, "10m");
        return res.redirect(302, SsoHelper.appendFragment(returnUrl, "jwt", token));
      } catch (e) {
        if (Environment.currentEnvironment === "dev") console.error("SSO callback error:", e);
        return res.redirect(302, SsoHelper.appendFragment(returnUrl, "loginError", "Login failed"));
      }
    });
  }
}
