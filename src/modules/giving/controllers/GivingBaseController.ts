import { BaseController } from "../../../shared/infrastructure";
import { Repositories } from "../repositories";

export class GivingBaseController extends BaseController {
  public repositories: Repositories;

  constructor() {
    super("giving");
  }
}
