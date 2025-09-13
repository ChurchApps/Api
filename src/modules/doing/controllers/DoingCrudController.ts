import { GenericCrudController } from "../../../shared/controllers/GenericCrudController";
import { Repositories } from "../repositories";

export abstract class DoingCrudController extends GenericCrudController {
  public declare repositories: Repositories;
  constructor() {
    super("doing");
  }
}

