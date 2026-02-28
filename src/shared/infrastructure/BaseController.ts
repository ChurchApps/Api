import { AuthenticatedUser, CustomBaseController } from "@churchapps/apihelper";
import { RepoManager } from "./RepoManager.js";
import express from "express";

interface AuditRouteConfig {
  category: string;
  entityType: string;
}

export class BaseController extends CustomBaseController {
  protected moduleName: string;

  private static AUDIT_ROUTES: Record<string, AuditRouteConfig> = {
    "/membership/people": { category: "person", entityType: "person" },
    "/membership/rolepermissions": { category: "permission", entityType: "rolePermission" },
    "/membership/rolemembers": { category: "permission", entityType: "roleMember" },
    "/membership/groups": { category: "group", entityType: "group" },
    "/membership/forms": { category: "form", entityType: "form" },
    "/membership/settings": { category: "settings", entityType: "setting" },
    "/giving/donations": { category: "donation", entityType: "donation" },
  };

  constructor(moduleName: string) {
    super();
    this.moduleName = moduleName;
  }

  protected async getRepos<T>(): Promise<T> {
    return await RepoManager.getRepos<T>(this.moduleName);
  }

  // Ensure repositories are hydrated per request without duplicating code in module controllers
  public actionWrapper(req: express.Request, res: express.Response, action: (au: AuthenticatedUser) => Promise<any>) {
    return super.actionWrapper(req, res, async (au) => {
      (this as any).repos = await this.getRepos<any>();
      const result = await action(au);

      // Auto-audit for mutations (POST to base route and DELETE with id)
      const config = BaseController.AUDIT_ROUTES[req.baseUrl];
      if (config) {
        const isPost = req.method === "POST" && req.path === "/";
        const isDelete = req.method === "DELETE" && !!req.params?.id;
        if (isPost || isDelete) {
          try {
            const { AuditLogHelper } = await import("../../modules/membership/helpers/AuditLogHelper.js");
            const membershipRepos = this.moduleName === "membership"
              ? (this as any).repos
              : await RepoManager.getRepos<any>("membership");
            const ip = AuditLogHelper.getClientIp(req);

            if (isDelete) {
              AuditLogHelper.log(membershipRepos, au.churchId, au.id, config.category, `${config.entityType}_deleted`, config.entityType, req.params.id, undefined, ip);
            } else {
              const items = Array.isArray(result) ? result : (result?.id ? [result] : []);
              if (items.length > 0) {
                for (const item of items) {
                  AuditLogHelper.log(membershipRepos, au.churchId, au.id, config.category, `${config.entityType}_saved`, config.entityType, item?.id, undefined, ip);
                }
              } else {
                AuditLogHelper.log(membershipRepos, au.churchId, au.id, config.category, `${config.entityType}_saved`, config.entityType, undefined, undefined, ip);
              }
            }
          } catch (e) { console.error("Auto-audit failed:", e); }
        }
      }

      // Return empty object instead of null for single entity queries
      return result === null ? {} : result;
    });
  }

  public actionWrapperAnon(req: express.Request, res: express.Response, action: () => Promise<any>) {
    return super.actionWrapperAnon(req, res, async () => {
      (this as any).repos = await this.getRepos<any>();
      const result = await action();
      // Return empty object instead of null for single entity queries
      return result === null ? {} : result;
    });
  }
}
