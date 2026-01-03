import { BaseController } from "../../../shared/infrastructure/index.js";
import { Repos } from "../repositories/index.js";

export class GivingBaseController extends BaseController {
  public repos: Repos;

  constructor() {
    super("giving");
  }
}
