import { BaseController } from "../../../shared/infrastructure/index.js";
import { Repos } from "../repositories/index.js";

export class MessagingBaseController extends BaseController {
  public repos: Repos;

  constructor() {
    super("messaging");
  }
}
