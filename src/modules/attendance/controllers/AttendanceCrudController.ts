import { GenericCrudController } from "../../../shared/controllers/GenericCrudController";
import { Repositories } from "../repositories";

export abstract class AttendanceCrudController extends GenericCrudController {
  declare public repositories: Repositories;
  constructor() {
    super("attendance");
  }
}
