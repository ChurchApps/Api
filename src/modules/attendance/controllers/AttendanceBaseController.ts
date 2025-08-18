import { BaseController } from "../../../shared/infrastructure/BaseController";
import { AttendanceRepositories } from "../repositories";

export class AttendanceBaseController extends BaseController {
  protected repositories?: AttendanceRepositories;

  constructor() {
    super("attendance");
  }

  /**
   * Get attendance repositories with proper type safety
   */
  protected async getAttendanceRepositories(): Promise<AttendanceRepositories> {
    if (!this.repositories) {
      this.repositories = await super.getRepositories<AttendanceRepositories>();
    }
    return this.repositories;
  }
}
