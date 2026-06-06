import { AuthenticatedUser } from "@churchapps/apihelper";
import { BaseController } from "../../../shared/infrastructure/index.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { Repos } from "../repositories/index.js";
import { Task } from "../models/index.js";

export class DoingBaseController extends BaseController {
  public repos: Repos;

  constructor() {
    super("doing");
  }

  // Editable by anyone with Doing Edit, or by the person the card is assigned to.
  public canEditCard(au: AuthenticatedUser, task: Task): boolean {
    if (au.checkAccess(Permissions.tasks.edit)) return true;
    return task?.assignedToType === "person" && !!task?.assignedToId && task.assignedToId === au.personId;
  }
}
