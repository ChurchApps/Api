import { controller, httpGet, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { AuditLogHelper, LoginRateLimiter, Permissions } from "../helpers/index.js";
import { MfaHelper } from "../helpers/MfaHelper.js";
import { TotpHelper } from "../helpers/TotpHelper.js";

@controller("/membership/users/mfa")
export class UserMfaController extends MembershipBaseController {
  @httpGet("/status")
  public async status(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au?.id) return this.json({}, 401);
      const record = await this.repos.userMfa.load(au.id);
      const backupCodesLeft = record?.enabled ? JSON.parse(record.backupCodes || "[]").length : 0;
      return this.json({ enabled: !!record?.enabled, backupCodesLeft }, 200);
    });
  }

  // authz-exempt: self-service — only ever touches au.id's own 2FA record
  @httpPost("/setup")
  public async setup(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au?.id) return this.json({}, 401);
      if (await this.repos.userMfa.isEnabled(au.id)) return this.json({ errors: ["Two-factor sign-in is already on"] }, 400);
      const user = await this.repos.user.load(au.id);
      if (!user) return this.json({}, 404);
      const secret = TotpHelper.generateSecret();
      await this.repos.userMfa.savePending(au.id, MfaHelper.encryptSecret(secret));
      return this.json({ secret, otpauthUrl: TotpHelper.otpauthUrl(secret, user.email) }, 200);
    });
  }

  // authz-exempt: self-service — only ever touches au.id's own 2FA record
  @httpPost("/enable")
  public async enable(req: express.Request<{}, {}, { code: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au?.id) return this.json({}, 401);
      const ip = LoginRateLimiter.getClientIp(req);
      const account = "mfa-setup:" + au.id;
      if (!(await LoginRateLimiter.allow(this.repos, ip, account, LoginRateLimiter.maxPerAccountStrict))) return this.json({ errors: ["Too many requests"] }, 429);

      const record = await this.repos.userMfa.load(au.id);
      if (!record || record.enabled) return this.json({ errors: ["Start setup again"] }, 400);
      const step = TotpHelper.matchStep(MfaHelper.decryptSecret(record.secret), req.body.code);
      if (step === null) {
        await LoginRateLimiter.recordFailure(this.repos, ip, account);
        return this.json({ errors: ["Invalid code"] }, 400);
      }

      const backup = MfaHelper.generateBackupCodes();
      if (!(await this.repos.userMfa.enable(au.id, JSON.stringify(backup.hashes), step))) return this.json({ errors: ["Start setup again"] }, 400);
      await LoginRateLimiter.clearFailures(this.repos, account, ip);
      AuditLogHelper.log(this.repos, au.churchId, au.id, "security", "mfa_enabled", "user", au.id, {}, AuditLogHelper.getClientIp(req));
      return this.json({ backupCodes: backup.codes }, 200);
    });
  }

  // authz-exempt: self-service — only ever touches au.id's own 2FA record, and needs a current code
  @httpPost("/disable")
  public async disable(req: express.Request<{}, {}, { code: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au?.id) return this.json({}, 401);
      const ip = LoginRateLimiter.getClientIp(req);
      const account = "mfa:" + au.id;
      if (!(await LoginRateLimiter.allow(this.repos, ip, account, LoginRateLimiter.maxPerAccountStrict))) return this.json({ errors: ["Too many requests"] }, 429);
      if (!(await MfaHelper.verifyCode(this.repos, au.id, req.body.code))) {
        await LoginRateLimiter.recordFailure(this.repos, ip, account);
        return this.json({ errors: ["Invalid code"] }, 400);
      }
      await this.repos.userMfa.delete(au.id);
      AuditLogHelper.log(this.repos, au.churchId, au.id, "security", "mfa_disabled", "user", au.id, {}, AuditLogHelper.getClientIp(req));
      return this.json({ enabled: false }, 200);
    });
  }

  @httpPost("/reset/:userId")
  public async reset(@requestParam("userId") userId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      await this.repos.userMfa.delete(userId);
      AuditLogHelper.log(this.repos, au.churchId, au.id, "security", "mfa_reset", "user", userId, {}, AuditLogHelper.getClientIp(req));
      return this.json({ enabled: false }, 200);
    });
  }
}
