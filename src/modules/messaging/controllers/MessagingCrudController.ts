import { GenericCrudController } from "../../../shared/controllers/GenericCrudController";
import { Repos } from "../repositories";

export abstract class MessagingCrudController extends GenericCrudController {
  declare public repos: Repos;
  constructor() {
    super("messaging");
  }
}
