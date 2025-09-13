import { GenericCrudController } from "../../../shared/controllers/GenericCrudController";
import { Repositories } from "../repositories";

export abstract class ContentCrudController extends GenericCrudController {
  public declare repositories: Repositories;
  constructor() {
    super("content");
  }
}

