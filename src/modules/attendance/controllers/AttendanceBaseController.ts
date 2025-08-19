import { BaseController } from "../../../shared/infrastructure/BaseController";
import { AttendanceRepositories } from "../repositories";

export class AttendanceBaseController extends BaseController {
  public repositories: AttendanceRepositories;

  constructor() {
    super("attendance");
  }

  protected async getAttendanceRepositories(): Promise<AttendanceRepositories> {
    if (!this.repositories) {
      this.repositories = await this.getRepositories<AttendanceRepositories>();
    }
    return this.repositories;
  }
}
