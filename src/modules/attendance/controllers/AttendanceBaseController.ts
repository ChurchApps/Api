import { ModuleBaseController } from "../../../shared/infrastructure/BaseController";
import { AttendanceRepositories } from "../repositories";

export class AttendanceBaseController extends ModuleBaseController<AttendanceRepositories> {
  constructor() {
    super("attendance");
  }

  /**
   * Get attendance repositories with proper type safety
   */
  protected async getAttendanceRepositories(): Promise<AttendanceRepositories> {
    return await this.getModuleRepositories();
  }
}
