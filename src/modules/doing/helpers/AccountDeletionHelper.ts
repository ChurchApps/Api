import { getMembershipModuleGateway } from "../../../shared/modules/index.js";
import { Task } from "../models/index.js";

interface Requester {
  churchId: string;
  personId?: string;
  firstName?: string;
  lastName?: string;
}

// A member asking to delete their own account files an "accountDeletion" task that the
// church's directory approval group reviews (Serving > Tasks) before anything is erased.
export class AccountDeletionHelper {
  public static readonly taskType = "accountDeletion";
  public static readonly approvalGroupSetting = "directoryApprovalGroupId";

  // Shapes a self-service request: the target and author are always the caller (never the
  // client-supplied values), and the task is routed to the approval group. Returns an error
  // when the church has not configured a group, so no request can be filed that nobody would see.
  public static async prepareRequest(au: Requester, task: Task): Promise<{ error?: string }> {
    if (!au.personId) return { error: "No person linked to this login" };
    const gateway = getMembershipModuleGateway();
    const groupId = await gateway.loadSetting(au.churchId, this.approvalGroupSetting);
    if (!groupId) return { error: "This church has not configured an approval group for account deletion requests" };

    const [group, person] = await Promise.all([gateway.loadGroup(au.churchId, groupId), gateway.loadPerson(au.churchId, au.personId)]);
    const displayName = (person as any)?.displayName || [au.firstName, au.lastName].filter(Boolean).join(" ") || "Member";

    task.id = undefined;
    task.churchId = au.churchId;
    task.taskType = this.taskType;
    task.status = "Open";
    task.dateClosed = undefined;
    task.workflowId = undefined;
    task.stepId = undefined;
    task.associatedWithType = "person";
    task.associatedWithId = au.personId;
    task.associatedWithLabel = displayName;
    task.createdByType = "person";
    task.createdById = au.personId;
    task.createdByLabel = displayName;
    task.assignedToType = "group";
    task.assignedToId = groupId;
    task.assignedToLabel = (group as any)?.name || "";
    task.title = "Account deletion request from " + displayName;
    task.data = JSON.stringify({ outcome: "pending" });
    return {};
  }
}
