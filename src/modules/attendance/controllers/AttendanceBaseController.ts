import { BaseController } from "../../../shared/infrastructure/index.js";
import { Repos } from "../repositories/index.js";

export class AttendanceBaseController extends BaseController {
  public repos: Repos;

  constructor() {
    super("attendance");
  }
}
