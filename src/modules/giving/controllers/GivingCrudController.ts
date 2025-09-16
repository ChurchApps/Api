import { GenericCrudController } from "../../../shared/controllers/GenericCrudController";
import { Repos } from "../repositories";

// Module-scoped CRUD base for Giving
// - Sets module name to "giving"
// - Provides typed repositories field for better intellisense
export abstract class GivingCrudController extends GenericCrudController {
  declare public repos: Repos;
  constructor() {
    super("giving");
  }
}
