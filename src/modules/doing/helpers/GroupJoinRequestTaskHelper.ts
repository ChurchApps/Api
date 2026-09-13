import { RepoManager } from "../../../shared/infrastructure/index.js";
import { InternalEventBus } from "../../../shared/events/InternalEventBus.js";
import { Task } from "../models/index.js";
import { Repos } from "../repositories/index.js";
import { getMembershipModuleGateway } from "../../../shared/modules/index.js";

export class GroupJoinRequestTaskHelper {
  // Creates an Open task in DoingApi assigned to the requested group so group leaders and admins
  // see the join request on their Task lists and Dashboard.
  public static async createJoinRequestTask(churchId: string, payload: any): Promise<Task | null> {
    try {
      if (!churchId || !payload?.groupId || !payload?.personId) return null;
      const repos = await RepoManager.getRepos<Repos>("doing");
      const membershipGateway = getMembershipModuleGateway();

      const group: any = await membershipGateway.loadGroup(churchId, payload.groupId);
      const person: any = await membershipGateway.loadPerson(churchId, payload.personId);

      const groupName = group?.name || "Group";
      const personName = person?.name?.display || person?.displayName || [person?.name?.first, person?.name?.last].filter(Boolean).join(" ") || "Someone";

      const task: Task = {
        churchId,
        taskType: "groupJoinRequest",
        associatedWithType: "person",
        associatedWithId: payload.personId,
        associatedWithLabel: personName,
        assignedToType: "group",
        assignedToId: payload.groupId,
        assignedToLabel: groupName,
        title: `Join Request: ${groupName}`,
        status: "Open",
        data: JSON.stringify({
          requestId: payload.id,
          groupId: payload.groupId,
          groupName,
          personId: payload.personId,
          personName,
          message: payload.message || ""
        })
      };

      const saved = await repos.task.save(task);
      await InternalEventBus.publish(churchId, "task.updated", saved);
      return saved;
    } catch (e) {
      console.error("Failed to create group join request task:", e);
      return null;
    }
  }

  // Closes any open tasks related to this group join request once approved, declined, or cancelled.
  public static async closeJoinRequestTask(churchId: string, payload: any): Promise<void> {
    try {
      if (!churchId || (!payload?.id && !payload?.personId)) return;
      const repos = await RepoManager.getRepos<Repos>("doing");
      const personId = payload.personId;
      if (!personId) return;

      const tasks = await repos.task.loadAll(churchId);
      const openRequests = tasks.filter((t: Task) =>
        t.taskType === "groupJoinRequest" &&
        t.status === "Open" &&
        t.associatedWithId === personId
      );

      for (const t of openRequests) {
        let match = false;
        if (t.data) {
          try {
            const parsed = JSON.parse(t.data);
            if (parsed.requestId === payload.id || (payload.groupId && parsed.groupId === payload.groupId)) {
              match = true;
            }
          } catch {
            // ignore
          }
        }
        if (match || !payload.id) {
          t.status = "Closed";
          t.dateClosed = new Date();
          await repos.task.save(t);
          await InternalEventBus.publish(churchId, "task.updated", t);
        }
      }
    } catch (e) {
      console.error("Failed to close group join request task:", e);
    }
  }

  // Bus subscriber for group membership events
  public static onEvent = async (churchId: string, event: string, payload: any): Promise<void> => {
    if (event === "group.member.requested") {
      await GroupJoinRequestTaskHelper.createJoinRequestTask(churchId, payload);
    } else if (event === "group.joinRequest.decided") {
      await GroupJoinRequestTaskHelper.closeJoinRequestTask(churchId, payload);
    }
  };
}
