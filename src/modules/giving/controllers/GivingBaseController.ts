import { BaseController } from "../../../shared/infrastructure/BaseController";
import { GivingRepositories } from "../repositories";

export class GivingBaseController extends BaseController {
  public repositories: GivingRepositories;

  constructor() {
    super("giving");
  }

  protected async getGivingRepositories(): Promise<GivingRepositories> {
    if (!this.repositories) {
      this.repositories = await this.getRepositories<GivingRepositories>();
    }
    return this.repositories;
  }
}
