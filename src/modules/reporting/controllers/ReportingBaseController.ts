import { BaseController } from "../../../shared/infrastructure";
import { Repositories } from "../repositories/Repositories";

export class ReportingBaseController extends BaseController {
  constructor() {
    super("reporting");
  }

  protected async getReportingRepositories(): Promise<Repositories> {
    return await this.getRepositories<Repositories>();
  }
}
