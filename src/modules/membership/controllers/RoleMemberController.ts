import { controller, httpPost, httpGet, httpDelete, requestParam } from "inversify-express-utils";
import { RoleMember, User } from "../models/index.js";
import express from "express";
import { AuthenticatedUser } from "../auth/index.js";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Permissions } from "../helpers/index.js";
import { IPermission } from "@churchapps/apihelper";
import bcrypt from "bcryptjs";
import crypto from "crypto";

@controller("/membership/rolemembers")
export class RoleMemberController extends MembershipBaseController {
  @httpGet("/roles/:id")
  public async loadByRole(@requestParam("id") id: string, req: express.Request<{}, {}, []>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const members = await this.repos.roleMember.loadByRoleId(id, au.churchId);
      const hasAccess = await this.checkAccess(members, Permissions.roles.view, au);
      if (!hasAccess) return this.json({}, 401);
      else {
        if (this.include(req, "users")) {
          const userIds: string[] = [];
          members.forEach((m) => {
            if (userIds.indexOf(m.userId) === -1) userIds.push(m.userId);
          });
          if (userIds.length > 0) {
            const users = await this.repos.user.loadByIds(userIds);
            users.forEach((u) => {
              const safeUser = { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName } as User;
              members.forEach((m) => {
                if (m.userId === u.id) m.user = safeUser;
              });
            });
          }
        }
        return this.json(members, 200);
      }
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, RoleMember[]>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      let members: RoleMember[] = req.body;
      const hasAccess = await this.checkAccess(members, Permissions.roles.edit, au);
      if (!hasAccess) return this.json({}, 401);
      else {
        if (members.some((m) => !m.roleId) || !(await this.rolesInChurch(members.map((m) => m.roleId), au.churchId))) return this.json({ error: "Invalid role" }, 400);
        const promises: Promise<RoleMember>[] = [];
        for (const member of members) {
          member.churchId = au.churchId;
          if (member.addedBy === undefined || member.addedBy === null) member.addedBy = au.id;
          if (member.userId === undefined || member.userId === null || member.userId === "") {
            if (!member.user?.email) return this.json({ error: "User email required" }, 400);
            member.userId = await this.getUserId(member.user);
          }
          promises.push(this.repos.roleMember.save(member));
        }
        members = await Promise.all(promises);
        return this.json(members, 200);
      }
    });
  }

  private async getUserId(user: User) {
    const existing: User = await this.repos.user.loadByEmail(user.email);
    if (existing !== null) return existing.id;
    const created = await this.repos.user.save({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      password: bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 10)
    } as User);
    return created.id;
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request<{}, {}, []>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const member = await this.repos.roleMember.loadById(id, au.churchId);
      const hasAccess = await this.checkAccess([member], Permissions.roles.edit, au);
      if (!hasAccess) return this.json({}, 401);
      else {
        await this.repos.roleMember.delete(id, au.churchId);
        return this.json([], 200);
      }
    });
  }

  @httpDelete("/self/:churchId/:userId")
  public async deleteSelf(@requestParam("churchId") _churchId: string, @requestParam("userId") userId: string, req: express.Request<{}, {}, []>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (userId !== au.id && !au.checkAccess(Permissions.roles.edit)) return this.json({}, 401);
      await this.repos.roleMember.deleteSelf(au.churchId, userId);
      return this.json([], 200);
    });
  }

  private async checkAccess(_members: RoleMember[], permission: IPermission, au: AuthenticatedUser) {
    const hasAccess = au.checkAccess(permission);
    /*
    if (hasAccess && au.apiName !== "AccessManagement") {
        const roleIds: string[] = [];
        members.forEach(m => { if (roleIds.indexOf(m.roleId) === -1) roleIds.push(m.roleId); })
        if (roleIds.length > 0) {
            const roles = await this.repos.role.loadByIds(roleIds);
            roles.forEach(r => { if (r.appName !== au.appName) hasAccess = false; })
        }
    }*/
    return hasAccess;
  }
}
