import { BaseController } from "../../../shared/infrastructure";
import { Repositories } from "../repositories";

export class ContentBaseController extends BaseController {
  public repositories: Repositories;

  constructor() {
    super("content");
  }
}
