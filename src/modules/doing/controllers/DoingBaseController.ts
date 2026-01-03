import { BaseController } from "../../../shared/infrastructure/index.js";
import { Repos } from "../repositories/index.js";

export class DoingBaseController extends BaseController {
  public repos: Repos;

  constructor() {
    super("doing");
  }
}
