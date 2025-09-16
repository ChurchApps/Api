import { BaseController } from "../../../shared/infrastructure";
import { Repos } from "../repositories/Repos";

export class ReportingBaseController extends BaseController {
  constructor() {
    super("reporting");
  }

  protected async getReportingRepos(): Promise<Repos> {
    return await this.getRepos<Repos>();
  }
}
