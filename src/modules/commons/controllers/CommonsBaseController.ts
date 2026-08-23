import { BaseController } from "../../../shared/infrastructure/index.js";
import { Repos } from "../repositories/index.js";

export class CommonsBaseController extends BaseController {
  public repos: Repos;

  constructor() {
    super("commons");
  }
}
