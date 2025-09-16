import { BaseController } from "../../../shared/infrastructure";
import { Repos } from "../repositories";

export class DoingBaseController extends BaseController {
  public repos: Repos;

  constructor() {
    super("doing");
  }
}
