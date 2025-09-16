import { BaseController } from "../../../shared/infrastructure";
import { Repos } from "../repositories";

export class GivingBaseController extends BaseController {
  public repos: Repos;

  constructor() {
    super("giving");
  }
}
