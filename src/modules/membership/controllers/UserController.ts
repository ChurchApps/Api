import { controller, httpDelete, httpGet, httpPost } from "inversify-express-utils";
import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { body, oneOf, validationResult } from "express-validator";
import { LoginRequest, User, ResetPasswordRequest, LoadCreateUserRequest, RegisterUserRequest, Church, EmailPassword, NewPasswordRequest, LoginUserChurch, Person } from "../models/index.js";
import { AuthenticatedUser } from "../auth/index.js";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { AuthGuidHelper, UserHelper, UserChurchHelper, UniqueIdHelper, Environment, Permissions, AuditLogHelper, LoginRateLimiter, MauticHelper, ChurchHelper, PublicPersonRateLimiter } from "../helpers/index.js";
import { ArrayHelper } from "@churchapps/apihelper";
import { TransactionalEmailHelper } from "../../../shared/helpers/TransactionalEmailHelper.js";

const emailPasswordValidation = [
  body("email").isEmail().trim().normalizeEmail({ gmail_remove_dots: false }).withMessage("enter a valid email address"),
  body("password").isLength({ min: 6 }).withMessage("must be at least 6 chars long")
];

const loadOrCreateValidation = [
  oneOf([
    [
      body("userEmail").exists().isEmail().withMessage("enter a valid email address").trim().normalizeEmail({ gmail_remove_dots: false }),
      body("firstName").exists().withMessage("enter first name").not().isEmpty().trim().escape(),
      body("lastName").exists().withMessage("enter last name").not().isEmpty().trim().escape()
    ],
    body("userId").exists().withMessage("enter userId").isString()
  ])
];

const registerValidation = [
  oneOf([
    [
      body("email").exists().isEmail().withMessage("enter a valid email address").trim().normalizeEmail({ gmail_remove_dots: false }),
      body("firstName").exists().withMessage("enter first name").not().isEmpty().trim().escape(),
      body("lastName").exists().withMessage("enter last name").not().isEmpty().trim().escape()
    ]
  ])
];

const setDisplayNameValidation = [
  body("userId").optional().isString(),
  body("firstName").exists().withMessage("enter first name").not().isEmpty().trim().escape(),
  body("lastName").exists().withMessage("enter last name").not().isEmpty().trim().escape()
];

const updateEmailValidation = [body("userId").optional().isString(), body("email").isEmail().trim().normalizeEmail({ gmail_remove_dots: false }).withMessage("enter a valid email address")];

const VERIFICATION_CODE_TTL_MS = 15 * 60 * 1000;
const VERIFICATION_MAX_ATTEMPTS = 5;

// A throwaway hash at the same cost factor as real passwords. Compared against when the email is
// unknown so both failure paths burn the same bcrypt time and cannot be told apart by response time.
const TIMING_EQUALIZER_HASH = "$2a$10$EIDWkbY3nzGaFR.cML8bBuI7fFECgvh7y93pqA6uT.8KrdHHy.Kma";

/** The rate-limit bucket an attempt belongs to: the account being targeted, if we can name one. */
function loginAccountKey(body: { email?: string; authGuid?: string }): string {
  const email = (body?.email || "").toString().trim().toLowerCase();
  if (email) return email;
  return body?.authGuid ? "guid:" + body.authGuid : "";
}

function generateVerificationCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

@controller("/membership/users")
export class UserController extends MembershipBaseController {
  @httpPost("/login")
  public async login(req: express.Request<{}, {}, LoginRequest>, res: express.Response): Promise<any> {
    // Ensure repositories are hydrated for anonymous access routes
    return this.actionWrapperAnon(req, res, async () => {
      try {
        const ip = AuditLogHelper.getClientIp(req);
        // A jwt refresh is already-proven identity, so it is not a credential guess and is not throttled.
        const isJwtRefresh = req.body.jwt !== undefined && req.body.jwt !== "";
        const rateLimitIp = LoginRateLimiter.getClientIp(req);
        const account = loginAccountKey(req.body);
        if (!isJwtRefresh && !(await LoginRateLimiter.allow(this.repos, rateLimitIp, account))) {
          return this.json({ errors: ["Too many requests"] }, 429);
        }

        let user: User = null;
        if (isJwtRefresh) {
          user = await AuthenticatedUser.loadUserByJwt(req.body.jwt, this.repos);
        } else if (req.body.authGuid !== undefined && req.body.authGuid !== "") {
          user = await this.repos.user.loadByAuthGuid(req.body.authGuid);
          if (user !== null) user = await this.consumeLoginGuid(user, req.body.authGuid);
        } else {
          const found = await this.repos.user.loadByEmail(req.body.email.trim());
          // Always run exactly one compare, even when the email is unknown, so the two failures cost the same.
          const passwordMatched = bcrypt.compareSync(req.body.password || "", found?.password?.toString() || TIMING_EQUALIZER_HASH);
          user = found !== null && passwordMatched ? found : null;
        }

        if (user === null) {
          if (!isJwtRefresh) await LoginRateLimiter.recordFailure(this.repos, rateLimitIp, account);
          const failEmail = req.body.email || req.body.authGuid || "(jwt)";
          AuditLogHelper.logLogin(this.repos, "", "", false, ip, { email: failEmail, reason: "Invalid Credentials" });
          return this.denyAccess(["Login failed"]);
        } else {
          const userChurches = await this.getUserChurches(user.id);

          const churchesOnly: Church[] = [];
          userChurches.forEach((uc) => churchesOnly.push(uc.church));
          await ChurchHelper.appendLogos(churchesOnly);
          userChurches.forEach((uc) => {
            const foundChurch = ArrayHelper.getOne(churchesOnly, "id", uc.church.id);
            uc.church.settings = foundChurch?.settings || [];
          });

          const result = await AuthenticatedUser.login(userChurches, user);
          if (result === null) return this.denyAccess(["No permissions"]);
          else {
            user.lastLogin = new Date();
            await this.repos.user.save(user);
            if (!isJwtRefresh) await LoginRateLimiter.clearFailures(this.repos, account);
            MauticHelper.trackLogin(user.email).catch(() => {});
            const selectedChurch = userChurches[0];
            if (selectedChurch) {
              AuditLogHelper.logLogin(this.repos, selectedChurch.church.id, user.id, true, ip, { email: user.email });
            }
            return this.json(result, 200);
          }
        }
      } catch (e) {
        if (Environment.currentEnvironment === "dev") {
          throw e;
        }
        return this.error([e.toString()]);
      }
    });
  }

  // Burns the login guid before anything else awaits, so a concurrent request can never observe it as unused.
  // The swap is a single conditional UPDATE, so exactly one of N racing requests wins and the rest are denied.
  private async consumeLoginGuid(user: User, rawGuid: string): Promise<User> {
    if (!AuthGuidHelper.canLogin(user.authGuid)) return null;
    const marked = AuthGuidHelper.markLoginUsed(user.authGuid, rawGuid);
    if (!(await this.repos.user.consumeAuthGuid(user.id, user.authGuid, marked))) return null;
    user.authGuid = marked;
    return user;
  }

  private async getUserChurches(id: string): Promise<LoginUserChurch[]> {
    // Load user churches via Roles
    const roleUserChurches = await this.repos.rolePermission.loadForUser(id, true); // Set to true so churches[0] is always a real church.  Not sre why it was false before.  If we need to change this make it a param on the login request

    UserHelper.replaceDomainAdminPermissions(roleUserChurches);
    UserHelper.addAllReportingPermissions(roleUserChurches);

    // Load churches via userChurches relationships
    const userChurches: LoginUserChurch[] = await this.repos.church.loadForUser(id);

    userChurches.forEach((uc) => {
      if (!ArrayHelper.getOne(roleUserChurches, "church.id", uc.church.id)) roleUserChurches.push(uc);
    });

    const peopleIds: string[] = [];
    roleUserChurches.forEach((uc) => {
      if (uc.person.id) peopleIds.push(uc.person.id);
    });

    const allPeople = peopleIds.length > 0 ? await this.repos.person.loadByIdsOnly(peopleIds) : [];
    const allGroups = peopleIds.length > 0 ? await this.repos.groupMember.loadForPeople(peopleIds) : [];
    roleUserChurches.forEach((uc) => {
      const person = ArrayHelper.getOne(allPeople as any[], "id", uc.person.id);
      if (person) uc.person.membershipStatus = person.membershipStatus;
      const groups = ArrayHelper.getAll(allGroups as any[], "personId", uc.person.id);
      uc.groups = [];
      // PASS groupId TO ID FIELD. OR CREATE NEW groupId FIELD.
      groups.forEach((g) => uc.groups.push({ id: g.groupId, tags: g.tags, name: g.name, leader: g.leader }));
    });

    return roleUserChurches;
  }

  @httpPost("/verifyCredentials", ...emailPasswordValidation)
  public async verifyCredentials(req: express.Request<{}, {}, EmailPassword>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const rateLimitIp = LoginRateLimiter.getClientIp(req);
        const account = loginAccountKey(req.body);
        if (!(await LoginRateLimiter.allow(this.repos, rateLimitIp, account))) return this.json({ errors: ["Too many requests"] }, 429);

        const user = await this.repos.user.loadByEmail(req.body.email);
        // One compare either way: an unknown email must not answer faster than a wrong password.
        const passwordMatched = bcrypt.compareSync(req.body.password || "", user?.password?.toString() || TIMING_EQUALIZER_HASH);
        if (user === null || !passwordMatched) {
          await LoginRateLimiter.recordFailure(this.repos, rateLimitIp, account);
          return this.denyAccess(["Login failed"]);
        }
        await LoginRateLimiter.clearFailures(this.repos, account);
        const userChurches = await this.repos.rolePermission.loadForUser(user.id, false);
        const churchNames = userChurches.map((uc) => uc.church.name);

        return this.json({ churches: churchNames }, 200);
      } catch (e) {
        if (Environment.currentEnvironment === "dev") {
          throw e;
        }
        this.logger.error(e);
        return this.error([e.toString()]);
      }
    });
  }

  private async grantAdminAccess(userChurches: LoginUserChurch[], churchId: string) {
    let universalChurch = null;
    userChurches.forEach((uc) => {
      if (uc.church.id === "") universalChurch = uc;
    });

    if (universalChurch !== null) {
      let selectedChurch = null;
      userChurches.forEach((uc) => {
        if (uc.church.id === churchId) selectedChurch = uc;
      });
      if (selectedChurch === null) {
        selectedChurch = await this.repos.rolePermission.loadForChurch(churchId, universalChurch);
        userChurches.push(selectedChurch);
      }
    }
  }

  // authz-exempt: open to any authenticated user — onboarding helper; provisions an inert user (random temp password, email-verification required) and returns no credentials (password nulled)
  @httpPost("/loadOrCreate", ...loadOrCreateValidation)
  public async loadOrCreate(req: express.Request<{}, {}, LoadCreateUserRequest>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { userId, userEmail, firstName, lastName } = req.body;
      const isStaff = !!(au?.id && (au.checkAccess(Permissions.people.edit) || au.checkAccess(Permissions.roles.edit) || au.checkAccess(Permissions.server.admin)));

      if (userId) {
        if (!isStaff && au?.id !== userId) return this.json({}, 401);
        const existing = await this.repos.user.load(userId);
        if (!existing) return this.json({}, 404);
        return this.json(this.publicUser(existing), 200);
      }

      const rateLimitIp = LoginRateLimiter.getClientIp(req);
      const account = (userEmail || "").toString().trim().toLowerCase();
      if (!(await LoginRateLimiter.allow(this.repos, rateLimitIp, account))) return this.json({ errors: ["Too many requests"] }, 429);
      if (!isStaff && !PublicPersonRateLimiter.allow(rateLimitIp, "users", "loadOrCreate")) return this.json({ errors: ["Too many requests"] }, 429);

      let user = await this.repos.user.loadByEmail(userEmail);
      let isNewUser = false;

      if (!user) {
        isNewUser = true;
        user = { email: userEmail, firstName, lastName };
        user.registrationDate = new Date();
        user.lastLogin = user.registrationDate;
        const tempPassword = UniqueIdHelper.shortId();
        user.password = bcrypt.hashSync(tempPassword, 10);
        user = await this.repos.user.save(user);

        // No mail here: nobody on this path asked for an account. Admins send the invite explicitly
        // via /users/sendInviteEmail, and self-service signup goes through /users/register.
        await UserChurchHelper.createForNewUser(user.id, user.email);
      }

      if (isStaff) return this.json({ ...this.publicUser(user), isNewUser }, 200);
      return this.json({ id: user.id, isNewUser }, 200);
    });
  }

  private publicUser(user: User) {
    return { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName };
  }

  @httpPost("/register", ...registerValidation)
  public async register(req: express.Request<{}, {}, RegisterUserRequest>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const register: RegisterUserRequest = req.body;
      let user: User = await this.repos.user.loadByEmail(register.email);
      let minted: { raw: string; stored: string } | null = null;

      if (user) return res.status(400).json({ errors: ["user already exists"] });
      else {
        const regStart = Date.now();
        const tempPassword = UniqueIdHelper.shortId();
        user = { email: register.email, firstName: register.firstName, lastName: register.lastName };
        minted = Environment.isMailConfigured ? null : AuthGuidHelper.mint();
        if (minted) user.authGuid = minted.stored;
        user.registrationDate = new Date();
        user.password = bcrypt.hashSync(tempPassword, 10);
        console.log("Register: bcrypt", Date.now() - regStart, "ms");

        const mailConfigured = Environment.isMailConfigured;
        const code = mailConfigured ? generateVerificationCode() : null;
        const codeHash = code ? bcrypt.hashSync(code, 10) : null;

        if (mailConfigured) {
          try {
            const emailStart = Date.now();
            const emailPromises: Promise<any>[] = [];
            emailPromises.push(UserHelper.sendWelcomeEmail(register.email, code, register.appName, register.appUrl));

            if (Environment.emailOnRegistration) {
              const emailBody = "Name: " + register.firstName + " " + register.lastName + "<br/>Email: " + register.email + "<br/>App: " + register.appName;
              emailPromises.push(TransactionalEmailHelper.sendTransactional(Environment.supportEmail, Environment.supportEmail, register.appName, register.appUrl, "New User Registration", emailBody));
            }
            await Promise.all(emailPromises);
            console.log("Register: emails", Date.now() - emailStart, "ms");
          } catch (err) {
            return this.json({ errors: [err.toString()] });
          }
        }

        let stepStart = Date.now();
        const userCount = await this.repos.user.loadCount();
        user = await this.repos.user.save(user);
        if (codeHash) await this.repos.user.updateVerification(user.id, codeHash, new Date(Date.now() + VERIFICATION_CODE_TTL_MS));
        console.log("Register: save user", Date.now() - stepStart, "ms");

        // Create userChurch records for matching people in non-archived churches
        stepStart = Date.now();
        await UserChurchHelper.createForNewUser(user.id, user.email);
        console.log("Register: createForNewUser", Date.now() - stepStart, "ms");

        // Link pre-selected church from People record match (even if person isn't in a group)
        if (register.churchId) {
          stepStart = Date.now();
          const existingUC = await this.repos.userChurch.loadByUserId(user.id, register.churchId);
          if (!existingUC) {
            const matchingPeople = await this.repos.person.searchEmail(register.churchId, user.email);
            const exactMatch = matchingPeople.find((p: Person) => p.contactInfo?.email?.toLowerCase() === user.email.toLowerCase());
            if (exactMatch) {
              await this.repos.userChurch.save({ userId: user.id, churchId: register.churchId, personId: exactMatch.id });
            }
          }
          console.log("Register: link churchId", Date.now() - stepStart, "ms");
        }

        // Add first user to server admins group
        if (userCount === 0) {
          const roles = await this.repos.role.loadAll();
          if (roles.length > 0) await this.repos.roleMember.save({ roleId: roles[0].id, userId: user.id, addedBy: user.id });
        }
        console.log("Register: total", Date.now() - regStart, "ms");
      }
      user.password = null;
      user.authGuid = null;
      const mailConfigured = Environment.isMailConfigured;
      const response: any = { ...user, mailConfigured };
      if (!mailConfigured && minted) response.authGuid = minted.raw;
      return this.json(response, 200);
    });
  }

  @httpPost("/setPasswordGuid")
  public async setPasswordGuid(req: express.Request<{}, {}, NewPasswordRequest>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      try {
        const user = await this.repos.user.loadByAuthGuid(req.body.authGuid);
        if (user !== null && AuthGuidHelper.canSetPassword(user.authGuid)) {
          user.authGuid = "";
          const hashedPass = bcrypt.hashSync(req.body.newPassword, 10);
          user.password = hashedPass;
          await this.repos.user.save(user);
          const ip = AuditLogHelper.getClientIp(req);
          AuditLogHelper.log(this.repos, "", user.id, "security", "password_changed", "user", user.id, { email: user.email, method: "authGuid" }, ip);
          return { success: true };
        } else return { success: false };
      } catch (e) {
        if (Environment.currentEnvironment === "dev") {
          throw e;
        }
        this.logger.error(e);
        return this.error([e.toString()]);
      }
    });
  }

  @httpPost("/forgot", body("userEmail").exists().trim().normalizeEmail({ gmail_remove_dots: false }).withMessage("enter a valid email address"))
  public async forgotPassword(req: express.Request<{}, {}, ResetPasswordRequest>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        if (!Environment.isMailConfigured) {
          return res.status(400).json({ errors: ["Email is not configured on this server. Please contact your administrator to reset your password."], mailConfigured: false });
        }

        const rateLimitIp = LoginRateLimiter.getClientIp(req);
        const account = (req.body.userEmail || "").toString().trim().toLowerCase();
        if (!(await LoginRateLimiter.allow(this.repos, rateLimitIp, account))) return this.json({ errors: ["Too many requests"] }, 429);

        const user = await this.repos.user.loadByEmail(req.body.userEmail);
        if (user !== null) {
          user.authGuid = "";
          const code = generateVerificationCode();
          const codeHash = bcrypt.hashSync(code, 10);
          const promises = [] as Promise<any>[];
          promises.push(this.repos.user.save(user));
          promises.push(this.repos.user.updateVerification(user.id, codeHash, new Date(Date.now() + VERIFICATION_CODE_TTL_MS)));
          promises.push(UserHelper.sendForgotEmail(user.email, code, req.body.appName, req.body.appUrl));
          await Promise.all(promises);
          const ip = AuditLogHelper.getClientIp(req);
          AuditLogHelper.log(this.repos, "", user.id, "security", "password_reset", "user", user.id, { email: user.email }, ip);
        }
        return this.json({ emailed: true }, 200);
      } catch (e) {
        if (Environment.currentEnvironment === "dev") {
          throw e;
        }
        this.logger.error(e);
        return this.error([e.toString()]);
      }
    });
  }

  @httpPost("/verifyCode", body("email").isEmail().trim().normalizeEmail({ gmail_remove_dots: false }).withMessage("enter a valid email address"), body("code").isString().isLength({ min: 6, max: 6 }).withMessage("enter a 6-digit code"))
  public async verifyCode(req: express.Request<{}, {}, { email: string; code: string }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const user = await this.repos.user.loadByEmail(req.body.email);
        if (user === null) return this.json({ errors: ["invalid code"] }, 400);
        if (!user.verificationCode || !user.verificationExpires) return this.json({ errors: ["invalid code"] }, 400);
        if (new Date(user.verificationExpires).getTime() < Date.now()) return this.json({ errors: ["code expired"] }, 400);

        const attempts = await this.repos.user.incrementVerificationAttempts(user.id);
        const ip = AuditLogHelper.getClientIp(req);
        if (attempts > VERIFICATION_MAX_ATTEMPTS) {
          await this.repos.user.clearVerification(user.id);
          AuditLogHelper.log(this.repos, "", user.id, "security", "verification_locked", "user", user.id, { email: user.email }, ip);
          return this.json({ errors: ["too many attempts"] }, 429);
        }

        const match = await bcrypt.compare(req.body.code, user.verificationCode);
        if (!match) return this.json({ errors: ["invalid code"] }, 400);

        const minted = AuthGuidHelper.mint();
        user.authGuid = minted.stored;
        await this.repos.user.save(user);
        await this.repos.user.clearVerification(user.id);
        AuditLogHelper.log(this.repos, "", user.id, "security", "code_verified", "user", user.id, { email: user.email }, ip);
        return this.json({ authGuid: minted.raw }, 200);
      } catch (e) {
        if (Environment.currentEnvironment === "dev") {
          throw e;
        }
        this.logger.error(e);
        return this.error([e.toString()]);
      }
    });
  }

  @httpPost("/checkEmail", body("email").isEmail().trim().normalizeEmail({ gmail_remove_dots: false }))
  public async checkEmail(req: express.Request<{}, {}, { email: string }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const user = await this.repos.user.loadByEmail(req.body.email);
      return this.json({ exists: !!user, peopleMatches: [] }, 200);
    });
  }

  @httpPost("/setDisplayName", ...setDisplayNameValidation)
  public async setDisplayName(req: express.Request<{}, {}, { firstName: string; lastName: string; userId?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const workingUserId = req.body.userId || au.id;
      if (workingUserId !== au.id && !au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      let user = await this.repos.user.load(workingUserId);
      if (user !== null) {
        user.firstName = req.body.firstName;
        user.lastName = req.body.lastName;
        user = await this.repos.user.save(user);
      }
      user.password = null;
      return this.json(user, 200);
    });
  }

  @httpPost("/updateEmail", ...updateEmailValidation)
  public async updateEmail(req: express.Request<{}, {}, { email: string; userId?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const workingUserId = req.body.userId || au.id;
      if (workingUserId !== au.id && !au.checkAccess(Permissions.server.admin)) return this.json({}, 401);
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      let user = await this.repos.user.load(workingUserId);
      if (user !== null) {
        const oldEmail = user.email;
        const existingUser = await this.repos.user.loadByEmail(req.body.email);
        if (existingUser === null || existingUser.id === workingUserId) {
          user.email = req.body.email;
          user = await this.repos.user.save(user);
          const ip = AuditLogHelper.getClientIp(req);
          AuditLogHelper.log(this.repos, au.churchId, au.id, "security", "email_changed", "user", workingUserId, { oldEmail, newEmail: req.body.email }, ip);
        } else return this.denyAccess(["Access denied"]);
      }

      user.password = null;
      return this.json(user, 200);
    });
  }

  @httpPost("/updateOptedOut")
  public async updateOptedOut(req: express.Request<{}, {}, { personId: string; optedOut: boolean }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.edit)) return this.json({}, 401);
      await this.repos.person.updateOptedOut(au.churchId, req.body.personId, req.body.optedOut);
      return this.json({}, 200);
    });
  }

  // authz-exempt: self-service — only ever loads/updates au.id (the JWT caller's own user); no request-supplied target id
  @httpPost("/updatePassword", body("newPassword").isLength({ min: 6 }).withMessage("must be at least 6 chars long"), body("currentPassword").isString().notEmpty().withMessage("current password is required"))
  public async updatePassword(req: express.Request<{}, {}, { newPassword: string; currentPassword: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      let user = await this.repos.user.load(au.id);
      if (user !== null) {
        const stored = user.password?.toString() || "";
        if (!req.body.currentPassword || !stored || !bcrypt.compareSync(req.body.currentPassword, stored)) return this.denyAccess(["Incorrect password"]);
        const hashedPass = bcrypt.hashSync(req.body.newPassword, 10);
        user.password = hashedPass;
        user.authGuid = "";
        user = await this.repos.user.save(user);
        const ip = AuditLogHelper.getClientIp(req);
        AuditLogHelper.log(this.repos, au.churchId, au.id, "security", "password_changed", "user", au.id, { email: user.email, method: "updatePassword" }, ip);
      }
      user.password = null;
      return this.json(user, 200);
    });
  }

  @httpGet("/search")
  public async search(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);

      const term = req.query.term ? req.query.term.toString() : "";
      if (!term || term.trim().length < 2) {
        return this.json([], 200);
      }

      const users = await this.repos.user.search(term.trim());
      users.forEach((user) => {
        user.password = null;
        user.authGuid = null;
      });

      return this.json(users, 200);
    });
  }

  @httpGet("/:id/details")
  public async details(req: express.Request<{ id: string }, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);

      const user = await this.repos.user.load(req.params.id);
      if (!user) return this.json({}, 404);

      const churches: { id: string; name: string; subDomain: string; viaMembership: boolean; viaRoles: boolean }[] = [];
      const upsert = (church: { id?: string; name?: string; subDomain?: string }, key: "viaMembership" | "viaRoles") => {
        if (!church?.id) return;
        let entry = ArrayHelper.getOne(churches, "id", church.id);
        if (!entry) {
          entry = { id: church.id, name: church.name, subDomain: church.subDomain, viaMembership: false, viaRoles: false };
          churches.push(entry);
        }
        entry[key] = true;
      };

      (await this.repos.userChurch.loadForUser(user.id)).forEach((uc: any) => upsert(uc.church, "viaMembership"));
      (await this.repos.rolePermission.loadForUser(user.id, true)).forEach((uc: any) => upsert(uc.church, "viaRoles"));

      return this.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        registrationDate: user.registrationDate,
        lastLogin: user.lastLogin,
        churches
      }, 200);
    });
  }

  @httpGet("/:id/impersonate")
  public async impersonate(req: express.Request<{ id: string }, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.server.admin)) return this.json({}, 401);

      const targetUser = await this.repos.user.load(req.params.id);
      if (!targetUser) return this.json({}, 404);

      return this.json({ jwt: AuthenticatedUser.getUserJwt(targetUser, "2 hours") }, 200);
    });
  }

  @httpPost("/sendInviteEmail")
  public async sendInviteEmail(req: express.Request<{}, {}, { email: string; personName: string; contextName: string; churchName: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.people.edit)) return this.json({}, 401);
      const { email, personName, contextName, churchName } = req.body;
      if (!email || !contextName) return res.status(400).json({ errors: ["email and contextName are required"] });

      const inviterEmail = au.email || undefined;
      let loginLink = "/";
      let isExistingUser = false;
      const user = await this.repos.user.loadByEmail(email);
      if (user) {
        isExistingUser = true;
        const minted = AuthGuidHelper.mint();
        user.authGuid = minted.stored;
        loginLink = `/login?auth=${minted.raw}`;
        await Promise.all([
          this.repos.user.save(user),
          UserHelper.sendInviteEmail(email, personName || "", contextName, churchName || "", loginLink, isExistingUser, inviterEmail)
        ]);
      } else {
        await UserHelper.sendInviteEmail(email, personName || "", contextName, churchName || "", loginLink, isExistingUser, inviterEmail);
      }

      return this.json({ success: true }, 200);
    });
  }

  // authz-exempt: self-service — deletes only au.id (caller's own user, userChurch, roleMembers); no request-supplied target id
  @httpDelete("/")
  public async Delete(req: express.Request<{}, {}, null>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      await this.repos.user.delete(au.id);
      await this.repos.userChurch.delete(au.id);
      await this.repos.roleMember.deleteUser(au.id);
      return this.json({});
    });
  }
}
