import { BaseController } from "../../../shared/infrastructure";
import { Repos } from "../repositories";

export class AttendanceBaseController extends BaseController {
  public repos: Repos;

  constructor() {
    super("attendance");
  }
}
