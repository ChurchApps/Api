import { GenericCrudController } from "../../../shared/controllers/GenericCrudController";
import { Repositories } from "../repositories";

export abstract class ReportingCrudController extends GenericCrudController {
  declare public repositories: Repositories;
  constructor() {
    super("reporting");
  }
}
