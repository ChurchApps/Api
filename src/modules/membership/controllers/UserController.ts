import { controller, httpDelete, httpGet, httpPost } from "inversify-express-utils";
import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { body, oneOf, validationResult } from "express-validator";
import { LoginRequest, User, ResetPasswordRequest, LoadCreateUserRequest, RegisterUserRequest, Church, EmailPassword, NewPasswordRequest, LoginUserChurch, Person } from "../models/index.js";
import { AuthenticatedUser } from "../auth/index.js";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { EmailHelper, UserHelper, UserChurchHelper, UniqueIdHelper, Environment, Permissions, AuditLogHelper } from "../helpers/index.js";
import { v4 } from "uuid";
import { ChurchHelper } from "../helpers/index.js";
import { ArrayHelper } from "@churchapps/apihelper";

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
        let user: User = null;
        if (req.body.jwt !== undefined && req.body.jwt !== "") {
          user = await AuthenticatedUser.loadUserByJwt(req.body.jwt, this.repos);
        } else if (req.body.authGuid !== undefined && req.body.authGuid !== "") {
          user = await this.repos.user.loadByAuthGuid(req.body.authGuid);
          if (user !== null) {
            // user.authGuid = "";
            // await this.repos.user.save(user);
          }
        } else {
          user = await this.repos.user.loadByEmail(req.body.email.trim());
          if (user !== null) {
            if (!bcrypt.compareSync(req.body.password, user.password?.toString() || "")) user = null;
          }
        }

        if (user === null) {
          const ip = AuditLogHelper.getClientIp(req);
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
            this.repos.user.save(user);
            const ip = AuditLogHelper.getClientIp(req);
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

        const user = await this.repos.user.loadByEmail(req.body.email);
        if (user === null) {
          return this.json({}, 200);
        }

        const passwordMatched = bcrypt.compareSync(req.body.password, user.password);
        if (!passwordMatched) {
          return this.denyAccess(["Incorrect password"]);
        }
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

  @httpPost("/loadOrCreate", ...loadOrCreateValidation)
  public async loadOrCreate(req: express.Request<{}, {}, LoadCreateUserRequest>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (_au) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { userId, userEmail, firstName, lastName } = req.body;
      let user: User;
      let isNewUser = false;

      if (userId) user = await this.repos.user.load(userId);
      else user = await this.repos.user.loadByEmail(userEmail);

      if (!user) {
        isNewUser = true;
        user = { email: userEmail, firstName, lastName };
        user.registrationDate = new Date();
        user.lastLogin = user.registrationDate;
        const tempPassword = UniqueIdHelper.shortId();
        user.password = bcrypt.hashSync(tempPassword, 10);
        user.authGuid = v4();
        user = await this.repos.user.save(user);

        const code = generateVerificationCode();
        const codeHash = bcrypt.hashSync(code, 10);
        await this.repos.user.updateVerification(user.id, codeHash, new Date(Date.now() + VERIFICATION_CODE_TTL_MS));
        await UserHelper.sendWelcomeEmail(user.email, code, null, null);
        // Create userChurch records for matching people in non-archived churches
        await UserChurchHelper.createForNewUser(user.id, user.email);
      }
      user.password = null;
      (user as any).isNewUser = isNewUser;
      return this.json(user, 200);
    });
  }

  @httpPost("/register", ...registerValidation)
  public async register(req: express.Request<{}, {}, RegisterUserRequest>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const register: RegisterUserRequest = req.body;
      let user: User = await this.repos.user.loadByEmail(register.email);

      if (user) return res.status(400).json({ errors: ["user already exists"] });
      else {
        const regStart = Date.now();
        const tempPassword = UniqueIdHelper.shortId();
        user = { email: register.email, firstName: register.firstName, lastName: register.lastName };
        user.authGuid = v4();
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
              emailPromises.push(EmailHelper.sendTemplatedEmail(Environment.supportEmail, Environment.supportEmail, register.appName, register.appUrl, "New User Registration", emailBody));
            }
            await Promise.all(emailPromises);
            console.log("Register: emails", Date.now() - emailStart, "ms");
          } catch (err) {
            return this.json({ errors: [err.toString()] });
          }
        }

        let stepStart = Date.now();
        const userCount = await this.repos.user.loadCount();
        const savedAuthGuid = user.authGuid;
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
          this.repos.role.loadAll().then((roles) => {
            this.repos.roleMember.save({ roleId: roles[0].id, userId: user.id, addedBy: user.id });
          });
        }
        console.log("Register: total", Date.now() - regStart, "ms");
      }
      user.password = null;
      const mailConfigured = Environment.isMailConfigured;
      const response: any = { ...user, mailConfigured };
      if (!mailConfigured) response.authGuid = user.authGuid;
      return this.json(response, 200);
    });
  }

  @httpPost("/setPasswordGuid")
  public async setPasswordGuid(req: express.Request<{}, {}, NewPasswordRequest>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      try {
        const user = await this.repos.user.loadByAuthGuid(req.body.authGuid);
        if (user !== null) {
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

        const user = await this.repos.user.loadByEmail(req.body.userEmail);
        if (user === null) return this.json({ emailed: false }, 200);
        else {
          const code = generateVerificationCode();
          const codeHash = bcrypt.hashSync(code, 10);
          const promises = [] as Promise<any>[];
          promises.push(this.repos.user.updateVerification(user.id, codeHash, new Date(Date.now() + VERIFICATION_CODE_TTL_MS)));
          promises.push(UserHelper.sendForgotEmail(user.email, code, req.body.appName, req.body.appUrl));
          await Promise.all(promises);
          const ip = AuditLogHelper.getClientIp(req);
          AuditLogHelper.log(this.repos, "", user.id, "security", "password_reset", "user", user.id, { email: user.email }, ip);
          return this.json({ emailed: true }, 200);
        }
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

        user.authGuid = user.authGuid || v4();
        await this.repos.user.save(user);
        await this.repos.user.clearVerification(user.id);
        AuditLogHelper.log(this.repos, "", user.id, "security", "code_verified", "user", user.id, { email: user.email }, ip);
        return this.json({ authGuid: user.authGuid }, 200);
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

      const email = req.body.email;
      const user = await this.repos.user.loadByEmail(email);

      if (user) {
        return this.json({ exists: true, peopleMatches: [] }, 200);
      }

      const churches = await this.repos.church.loadAll();
      const matches: Array<{ firstName: string; lastName: string; churchId: string; churchName: string }> = [];

      for (const church of churches) {
        const matchingPeople = await this.repos.person.searchEmail(church.id, email);
        const exactMatches = matchingPeople.filter((p: Person) => p.contactInfo?.email?.toLowerCase() === email.toLowerCase());
        for (const person of exactMatches) {
          matches.push({
            firstName: person.name?.first || "",
            lastName: person.name?.last || "",
            churchId: church.id,
            churchName: church.name
          });
        }
      }

      return this.json({ exists: false, peopleMatches: matches }, 200);
    });
  }

  @httpPost("/setDisplayName", ...setDisplayNameValidation)
  public async setDisplayName(req: express.Request<{}, {}, { firstName: string; lastName: string; userId?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      let user = await this.repos.user.load(req.body.userId || au.id);
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
    return this.actionWrapper(req, res, async () => {
      await this.repos.person.updateOptedOut(req.body.personId, req.body.optedOut);
      return this.json({}, 200);
    });
  }

  @httpPost("/updatePassword", body("newPassword").isLength({ min: 6 }).withMessage("must be at least 6 chars long"))
  public async updatePassword(req: express.Request<{}, {}, { newPassword: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      let user = await this.repos.user.load(au.id);
      if (user !== null) {
        const hashedPass = bcrypt.hashSync(req.body.newPassword, 10);
        user.password = hashedPass;
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

  @httpPost("/sendInviteEmail")
  public async sendInviteEmail(req: express.Request<{}, {}, { email: string; personName: string; contextName: string; churchName: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (_au) => {
      const { email, personName, contextName, churchName } = req.body;
      if (!email || !contextName) return res.status(400).json({ errors: ["email and contextName are required"] });

      let loginLink = "/";
      let isExistingUser = false;
      const user = await this.repos.user.loadByEmail(email);
      if (user) {
        isExistingUser = true;
        user.authGuid = v4();
        loginLink = `/login?auth=${user.authGuid}`;
        await Promise.all([
          this.repos.user.save(user),
          UserHelper.sendInviteEmail(email, personName || "", contextName, churchName || "", loginLink, isExistingUser)
        ]);
      } else {
        await UserHelper.sendInviteEmail(email, personName || "", contextName, churchName || "", loginLink, isExistingUser);
      }

      return this.json({ success: true }, 200);
    });
  }

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
