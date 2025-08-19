import { ModuleBaseController } from "../../../shared/infrastructure/BaseController";
import { DoingRepositories } from "../repositories";

export class DoingBaseController extends ModuleBaseController<DoingRepositories> {
  constructor() {
    super("doing");
  }

  /**
   * Get doing repositories with proper type safety
   */
  protected async getDoingRepositories(): Promise<DoingRepositories> {
    return await this.getModuleRepositories();
  }
}
