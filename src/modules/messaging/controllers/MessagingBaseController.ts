import { BaseController } from "../../../shared/infrastructure";
import { Repositories } from "../repositories";

export class MessagingBaseController extends BaseController {
  public repositories: Repositories;

  constructor() {
    super("messaging");
  }
}
