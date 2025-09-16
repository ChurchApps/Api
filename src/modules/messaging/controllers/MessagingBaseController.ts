import { BaseController } from "../../../shared/infrastructure";
import { Repos } from "../repositories";

export class MessagingBaseController extends BaseController {
  public repos: Repos;

  constructor() {
    super("messaging");
  }
}
