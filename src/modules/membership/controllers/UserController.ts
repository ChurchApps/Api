import { controller, httpDelete, httpGet, httpPost } from "inversify-express-utils";
import express from "express";
import bcrypt from "bcryptjs";
import { body, oneOf, validationResult } from "express-validator";
import { LoginRequest, User, ResetPasswordRequest, LoadCreateUserRequest, RegisterUserRequest, Church, EmailPassword, NewPasswordRequest, LoginUserChurch } from "../models/index.js";
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
            userChurches.forEach((uc) => {
              AuditLogHelper.logLogin(this.repos, uc.church.id, user.id, true, ip, { email: user.email });
            });
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

      if (userId) user = await this.repos.user.load(userId);
      else user = await this.repos.user.loadByEmail(userEmail);

      if (!user) {
        const timestamp = Date.now();
        user = { email: userEmail, firstName, lastName };
        user.registrationDate = new Date();
        user.lastLogin = user.registrationDate;
        const tempPassword = UniqueIdHelper.shortId();
        user.password = bcrypt.hashSync(tempPassword, 10);
        user.authGuid = v4();
        user = await this.repos.user.save(user);
        await UserHelper.sendWelcomeEmail(user.email, `/login?auth=${user.authGuid}&timestamp=${timestamp}`, null, null);
        // Create userChurch records for matching people in groups
        await UserChurchHelper.createForNewUser(user.id, user.email);
      }
      user.password = null;
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
        const tempPassword = UniqueIdHelper.shortId();
        user = { email: register.email, firstName: register.firstName, lastName: register.lastName };
        user.authGuid = v4();
        user.registrationDate = new Date();
        user.password = bcrypt.hashSync(tempPassword, 10);

        try {
          const timestamp = Date.now();
          await UserHelper.sendWelcomeEmail(register.email, `/login?auth=${user.authGuid}&timestamp=${timestamp}`, register.appName, register.appUrl);

          if (Environment.emailOnRegistration) {
            const emailBody = "Name: " + register.firstName + " " + register.lastName + "<br/>Email: " + register.email + "<br/>App: " + register.appName;
            await EmailHelper.sendTemplatedEmail(Environment.supportEmail, Environment.supportEmail, register.appName, register.appUrl, "New User Registration", emailBody);
          }
        } catch (err) {
          return this.json({ errors: [err.toString()] });
          // return this.json({ errors: ["Email address does not exist."] })
        }
        const userCount = await this.repos.user.loadCount();

        user = await this.repos.user.save(user);

        // Create userChurch records for matching people in groups
        await UserChurchHelper.createForNewUser(user.id, user.email);

        // Add first user to server admins group
        if (userCount === 0) {
          this.repos.role.loadAll().then((roles) => {
            this.repos.roleMember.save({ roleId: roles[0].id, userId: user.id, addedBy: user.id });
          });
        }
      }
      user.password = null;
      return this.json(user, 200);
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

        const user = await this.repos.user.loadByEmail(req.body.userEmail);
        if (user === null) return this.json({ emailed: false }, 200);
        else {
          user.authGuid = v4();
          const promises = [] as Promise<any>[];
          const timestamp = Date.now();
          promises.push(this.repos.user.save(user));
          promises.push(UserHelper.sendForgotEmail(user.email, `/login?auth=${user.authGuid}&timestamp=${timestamp}`, req.body.appName, req.body.appUrl));
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
