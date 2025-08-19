import { CustomBaseController } from "@churchapps/apihelper";
import { Repositories } from "../repositories";

export class GivingBaseController extends CustomBaseController {
  public repositories: Repositories;

  constructor() {
    super();
    this.repositories = Repositories.getCurrent();
  }
}
