import { getMembershipModuleGateway } from "../../../shared/modules/index.js";
import { Task } from "../models/index.js";

interface Requester {
  churchId: string;
  personId?: string;
}

interface HouseholdPerson {
  id?: string;
  householdId?: string | null;
  householdRole?: string | null;
  birthDate?: Date | string | null;
  displayName?: string | null;
}

// A household adult asking staff to change another member's record (a child's birth date, phone, photo).
// Rule: the requester is the Head or Spouse of their household and is not known to be under 18; the target
// is a different person in the same household of the same church whose role is Child and who is not known
// to be 18 or older. The request always goes to the directory approval group; nothing is written to the
// person until staff apply it, and a church with no approval group cannot take these requests at all.
export class HouseholdEditHelper {
  public static readonly adultAge = 18;
  public static readonly adultRoles = ["head", "spouse"];
  public static readonly childRole = "child";
  public static readonly approvalGroupSetting = "directoryApprovalGroupId";

  public static age(birthDate: Date | string | null | undefined, now = new Date()): number | null {
    if (!birthDate) return null;
    const d = new Date(birthDate);
    if (isNaN(d.getTime())) return null;
    let age = now.getUTCFullYear() - d.getUTCFullYear();
    if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) age--;
    return age;
  }

  private static role(p: HouseholdPerson): string {
    return (p.householdRole || "").trim().toLowerCase();
  }

  public static isAdultRequester(p: HouseholdPerson, now = new Date()): boolean {
    const age = this.age(p.birthDate, now);
    return this.adultRoles.includes(this.role(p)) && !(age !== null && age < this.adultAge);
  }

  public static isEligibleTarget(p: HouseholdPerson, now = new Date()): boolean {
    const age = this.age(p.birthDate, now);
    return this.role(p) === this.childRole && !(age !== null && age >= this.adultAge);
  }

  // Shapes the task server-side: identity, assignment and status never come from the client.
  public static async prepareRequest(au: Requester, task: Task, now = new Date()): Promise<{ error?: string; status?: number }> {
    const targetId = task.associatedWithId;
    if (!au.personId || !targetId || targetId === au.personId) return { status: 401 };
    const gateway = getMembershipModuleGateway();
    const [requester, target] = await Promise.all([gateway.loadPerson(au.churchId, au.personId), gateway.loadPerson(au.churchId, targetId)]);
    if (!requester || !target) return { status: 401 };
    if (!requester.householdId || requester.householdId !== target.householdId) return { status: 401 };
    if (!this.isAdultRequester(requester, now) || !this.isEligibleTarget(target, now)) return { status: 401 };

    let changes: unknown;
    try { changes = JSON.parse(task.data || "[]"); } catch { changes = null; }
    if (!Array.isArray(changes) || changes.length === 0) return { status: 400, error: "No changes to submit" };
    if (changes.some((c) => c?.field === "familyMember")) return { status: 400, error: "Family members are added from your own profile" };

    const groupId = await gateway.loadSetting(au.churchId, this.approvalGroupSetting);
    if (!groupId) return { status: 400, error: "This church has not configured an approval group for directory changes" };
    const group = await gateway.loadGroup(au.churchId, groupId);

    const targetName = target.displayName || "member";
    const requesterName = requester.displayName || "member";
    task.id = undefined;
    task.churchId = au.churchId;
    task.taskType = "directoryUpdate";
    task.status = "Open";
    task.dateClosed = undefined;
    task.workflowId = undefined;
    task.stepId = undefined;
    task.associatedWithType = "person";
    task.associatedWithId = target.id;
    task.associatedWithLabel = targetName;
    task.createdByType = "person";
    task.createdById = au.personId;
    task.createdByLabel = requesterName;
    task.assignedToType = "group";
    task.assignedToId = groupId;
    task.assignedToLabel = group?.name || "";
    task.title = `Profile changes for ${targetName} (submitted by ${requesterName})`;
    return {};
  }
}
