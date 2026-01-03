import { BaseController } from "../../../shared/infrastructure/index.js";
import { Repos } from "../repositories/Repos.js";

export class ReportingBaseController extends BaseController {
  constructor() {
    super("reporting");
  }

  protected async getReportingRepos(): Promise<Repos> {
    return await this.getRepos<Repos>();
  }
}
