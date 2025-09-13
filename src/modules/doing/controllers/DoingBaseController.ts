import { BaseController } from "../../../shared/infrastructure";
import { Repositories } from "../repositories";

export class DoingBaseController extends BaseController {
  public repositories: Repositories;

  constructor() {
    super("doing");
  }
}
