import { RepoManager } from "../../../shared/infrastructure/index.js";
import { InternalEventBus } from "../../../shared/events/InternalEventBus.js";
import { Task } from "../models/index.js";
import { Repos } from "../repositories/index.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";

export class GroupJoinRequestTaskHelper {
  public static readonly taskType = "groupJoinRequest";

  // One Open task per group leader (or, if the group has no leader, per person with
  // groupMembers.edit) so they can approve/decline from Serving > Tasks.
  public static async createJoinRequestTask(churchId: string, payload: any): Promise<Task[]> {
    if (!churchId || !payload?.groupId || !payload?.personId) return [];
    const repos = await RepoManager.getRepos<Repos>("doing");
    const membership = getMembershipModuleGateway();

    const leaderIds = await membership.loadGroupLeaderPersonIds(churchId, payload.groupId);
    let assigneeIds = unique(leaderIds.filter((id) => id && id !== payload.personId));
    if (assigneeIds.length === 0) {
      const staffIds = await membership.loadPersonIdsWithPermission(churchId, "Group Members", "Edit");
      assigneeIds = unique(staffIds.filter((id) => id && id !== payload.personId));
    }
    if (assigneeIds.length === 0) return [];

    const [group, people] = await Promise.all([
      membership.loadGroup(churchId, payload.groupId),
      membership.loadPeople(churchId, [...assigneeIds, payload.personId])
    ]);
    const groupName = group?.name || "Group";
    const personName = people.find((p) => p.id === payload.personId)?.displayName || "Someone";
    const data = JSON.stringify({
      requestId: payload.id,
      groupId: payload.groupId,
      groupName,
      personId: payload.personId,
      personName,
      message: payload.message || ""
    });

    const saved: Task[] = [];
    for (const assigneeId of assigneeIds) {
      const assigneeName = people.find((p) => p.id === assigneeId)?.displayName || "Staff";
      const task: Task = {
        churchId,
        taskType: GroupJoinRequestTaskHelper.taskType,
        status: "Open",
        title: `${personName} requested to join ${groupName}`,
        associatedWithType: "person",
        associatedWithId: payload.personId,
        associatedWithLabel: personName,
        createdByType: "person",
        createdById: payload.personId,
        createdByLabel: personName,
        assignedToType: "person",
        assignedToId: assigneeId,
        assignedToLabel: assigneeName,
        data
      };
      const row = await repos.task.save(task);
      await InternalEventBus.publish(churchId, "task.updated", row);
      saved.push(row);
    }
    return saved;
  }

  public static async closeJoinRequestTask(churchId: string, payload: any): Promise<void> {
    if (!churchId || !payload?.id) return;
    const repos = await RepoManager.getRepos<Repos>("doing");
    const open = await repos.task.loadOpenByTaskType(churchId, GroupJoinRequestTaskHelper.taskType);
    for (const task of open) {
      let requestId: string | undefined;
      if (task.data) {
        try { requestId = JSON.parse(task.data).requestId; } catch { /* ignore malformed data */ }
      }
      if (requestId !== payload.id) continue;
      task.status = "Closed";
      task.dateClosed = new Date();
      await repos.task.save(task);
      await InternalEventBus.publish(churchId, "task.updated", task);
    }
  }

  public static onEvent = async (churchId: string, event: string, payload: any): Promise<void> => {
    if (event === "group.member.requested") await GroupJoinRequestTaskHelper.createJoinRequestTask(churchId, payload);
    else if (event === "group.joinRequest.decided") await GroupJoinRequestTaskHelper.closeJoinRequestTask(churchId, payload);
  };
}

function unique(ids: string[]) {
  return [...new Set(ids)];
}
