import { GenericCrudController } from "../../../shared/controllers/GenericCrudController.js";
import { Repos } from "../repositories/index.js";

export abstract class ContentCrudController extends GenericCrudController {
  declare public repos: Repos;
  constructor() {
    super("content");
  }
}
