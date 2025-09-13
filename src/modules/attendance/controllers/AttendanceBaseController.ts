import { BaseController } from "../../../shared/infrastructure";
import { Repositories } from "../repositories";

export class AttendanceBaseController extends BaseController {
  public repositories: Repositories;

  constructor() {
    super("attendance");
  }
}
