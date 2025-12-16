import { AuthenticatedUser, CustomBaseController } from "@churchapps/apihelper";
import { RepoManager } from "./RepoManager";
import express from "express";

export class BaseController extends CustomBaseController {
  protected moduleName: string;

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
