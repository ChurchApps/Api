import { BaseController } from "../../../shared/infrastructure/BaseController";
import { DoingRepositories } from "../repositories";

export class DoingBaseController extends BaseController {
  protected repositories?: DoingRepositories;

  constructor() {
    super("doing");
  }

  /**
   * Get doing repositories with proper type safety
   */
  protected async getDoingRepositories(): Promise<DoingRepositories> {
    if (!this.repositories) {
      this.repositories = await super.getRepositories<DoingRepositories>();
    }
    return this.repositories;
  }
}
