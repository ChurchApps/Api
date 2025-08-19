import { BaseController } from "../../../shared/infrastructure/BaseController";
import { DoingRepositories } from "../repositories";

export class DoingBaseController extends BaseController {
  public repositories: DoingRepositories;

  constructor() {
    super("doing");
  }

  protected async getDoingRepositories(): Promise<DoingRepositories> {
    if (!this.repositories) {
      this.repositories = await this.getRepositories<DoingRepositories>();
    }
    return this.repositories;
  }
}
