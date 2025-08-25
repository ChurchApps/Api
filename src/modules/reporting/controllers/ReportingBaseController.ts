import { BaseController } from "../../../shared/infrastructure";
import { ReportingRepositories } from "../repositories/ReportingRepositories";

export class ReportingBaseController extends BaseController {
  constructor() {
    super("reporting");
  }

  protected async getReportingRepositories(): Promise<ReportingRepositories> {
    return await this.getRepositories<ReportingRepositories>();
  }
}