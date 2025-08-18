import { BaseController } from "../../../shared/infrastructure/BaseController";
import { GivingRepositories } from "../repositories";

export class GivingBaseController extends BaseController {
  protected repositories?: GivingRepositories;

  constructor() {
    super("giving");
  }

  /**
   * Get giving repositories with proper type safety
   */
  protected async getGivingRepositories(): Promise<GivingRepositories> {
    if (!this.repositories) {
      this.repositories = await super.getRepositories<GivingRepositories>();
    }
    return this.repositories;
  }
}
