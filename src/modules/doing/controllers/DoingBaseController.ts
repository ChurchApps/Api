import { BaseController } from "../../../shared/infrastructure/index.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { Repos } from "../repositories/index.js";
import { Task } from "../models/index.js";

interface PermissionUser {
  personId?: string;
  checkAccess(permission: { contentType: string; action: string; apiName?: string }): boolean;
}

export class DoingBaseController extends BaseController {
  public repos: Repos;

  constructor() {
    super("doing");
  }

  // A card may be edited by anyone with the Doing "Edit" permission (Edit All Cards),
  // or by the person it is currently assigned to (Edit Assigned Cards tier).
  public canEditCard(au: PermissionUser, task: Task): boolean {
    if (au.checkAccess(Permissions.doing.edit)) return true;
    return task?.assignedToType === "person" && !!task?.assignedToId && task.assignedToId === au.personId;
  }
}
