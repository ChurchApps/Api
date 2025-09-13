import { CustomBaseController } from "@churchapps/apihelper";
import { RepositoryManager } from "./RepositoryManager";
import express from "express";

export class BaseController extends CustomBaseController {
  protected moduleName: string;

  constructor(moduleName: string) {
    super();
    this.moduleName = moduleName;
  }

  protected async getRepositories<T>(): Promise<T> {
    return await RepositoryManager.getRepositories<T>(this.moduleName);
  }

  // Ensure repositories are hydrated per request without duplicating code in module controllers
  public actionWrapper(req: express.Request, res: express.Response, action: (au: any) => Promise<any>) {
    return super.actionWrapper(req, res, async (au) => {
      (this as any).repositories = await this.getRepositories<any>();
      return action(au);
    });
  }

  public actionWrapperAnon(req: express.Request, res: express.Response, action: () => Promise<any>) {
    return super.actionWrapperAnon(req, res, async () => {
      (this as any).repositories = await this.getRepositories<any>();
      return action();
    });
  }
}
