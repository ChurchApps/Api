import { GenericCrudController } from "../../../shared/controllers/GenericCrudController";
import { Repos } from "../repositories";

export abstract class ContentCrudController extends GenericCrudController {
  declare public repos: Repos;
  constructor() {
    super("content");
  }
}
