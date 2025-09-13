import { GenericCrudController } from "../../../shared/controllers/GenericCrudController";
import { Repositories } from "../repositories";

export abstract class MembershipCrudController extends GenericCrudController {
  declare public repositories: Repositories;
  constructor() {
    super("membership");
  }
}
