import { CustomBaseController } from "@churchapps/apihelper";
import { RepositoryManager } from "./RepositoryManager";

export class BaseController extends CustomBaseController {
  protected moduleName: string;

  constructor(moduleName: string) {
    super();
    this.moduleName = moduleName;
  }

  protected async getRepositories<T>(): Promise<T> {
    return await RepositoryManager.getRepositories<T>(this.moduleName);
  }
}
