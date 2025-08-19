import { ModuleBaseController } from "../../../shared/infrastructure/BaseController";
import { GivingRepositories } from "../repositories";

export class GivingBaseController extends ModuleBaseController<GivingRepositories> {
  constructor() {
    super("giving");
  }

  /**
   * Get giving repositories with proper type safety
   */
  protected async getGivingRepositories(): Promise<GivingRepositories> {
    return await this.getModuleRepositories();
  }
}
