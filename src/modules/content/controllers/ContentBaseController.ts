import { BaseController } from "../../../shared/infrastructure";
import { Repos } from "../repositories";

export class ContentBaseController extends BaseController {
  public repos: Repos;

  constructor() {
    super("content");
  }
}
