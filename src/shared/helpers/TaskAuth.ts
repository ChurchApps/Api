import { Permissions } from "./Permissions.js";

type TaskViewer = { personId?: string; groupIds?: string[]; checkAccess: (p: any) => boolean };
type TaskRef = { associatedWithType?: string; associatedWithId?: string; createdByType?: string; createdById?: string; assignedToType?: string; assignedToId?: string };

// One rule for who can open a workflow card: doing (/doing/tasks) and messaging (card notes) both use it.
export class TaskAuth {
  static canViewTask(au: TaskViewer, task: TaskRef): boolean {
    if (au.checkAccess(Permissions.tasks.view)) return true;
    const isMe = (type?: string, id?: string) => type === "person" && !!id && id === au.personId;
    const isMyGroup = (type?: string, id?: string) => type === "group" && !!id && !!au.groupIds?.includes(id);
    return isMe(task.associatedWithType, task.associatedWithId) || isMe(task.createdByType, task.createdById) || isMe(task.assignedToType, task.assignedToId)
      || isMyGroup(task.assignedToType, task.assignedToId) || isMyGroup(task.createdByType, task.createdById);
  }
}
