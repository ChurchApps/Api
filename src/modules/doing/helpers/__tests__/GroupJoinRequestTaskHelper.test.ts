import "reflect-metadata";

const save = jest.fn(async (t: any) => ({ ...t, id: t.id || "task-" + t.assignedToId }));
const loadOpenByTaskType = jest.fn();
jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn(async () => ({ task: { save, loadOpenByTaskType } })) } }));

const publish = jest.fn();
jest.mock("../../../../shared/events/InternalEventBus.js", () => ({ InternalEventBus: { publish } }));

const loadGroupLeaderPersonIds = jest.fn();
const loadPersonIdsWithPermission = jest.fn();
const loadGroup = jest.fn();
const loadPeople = jest.fn();
jest.mock("../../../../shared/modules/index.js", () => ({ getMembershipModuleGateway: () => ({ loadGroupLeaderPersonIds, loadPersonIdsWithPermission, loadGroup, loadPeople }) }));

import { GroupJoinRequestTaskHelper } from "../GroupJoinRequestTaskHelper.js";

const payload = { id: "req1", groupId: "g1", personId: "p-req", message: "Please let me in" };

describe("GroupJoinRequestTaskHelper", () => {
  beforeEach(() => {
    save.mockClear();
    loadOpenByTaskType.mockReset();
    publish.mockReset();
    loadGroupLeaderPersonIds.mockReset();
    loadPersonIdsWithPermission.mockReset();
    loadGroup.mockReset().mockResolvedValue({ id: "g1", name: "Community Service Team" });
    loadPeople.mockReset().mockResolvedValue([
      { id: "p-req", displayName: "Rachel Martin" },
      { id: "p-lead", displayName: "Demo User" },
      { id: "p-admin", displayName: "Staff Admin" }
    ]);
  });

  it("creates one Open task per group leader, not for the requester", async () => {
    loadGroupLeaderPersonIds.mockResolvedValue(["p-lead", "p-req", "p-lead"]);
    const tasks = await GroupJoinRequestTaskHelper.createJoinRequestTask("c1", payload);
    expect(loadPersonIdsWithPermission).not.toHaveBeenCalled();
    expect(tasks).toHaveLength(1);
    expect(save).toHaveBeenCalledTimes(1);
    const saved = save.mock.calls[0][0];
    expect(saved.taskType).toBe("groupJoinRequest");
    expect(saved.status).toBe("Open");
    expect(saved.assignedToType).toBe("person");
    expect(saved.assignedToId).toBe("p-lead");
    expect(saved.assignedToLabel).toBe("Demo User");
    expect(saved.associatedWithId).toBe("p-req");
    expect(saved.createdById).toBe("p-req");
    expect(saved.title).toBe("Rachel Martin requested to join Community Service Team");
    expect(JSON.parse(saved.data).requestId).toBe("req1");
    expect(JSON.parse(saved.data).message).toBe("Please let me in");
    expect(publish).toHaveBeenCalledWith("c1", "task.updated", expect.objectContaining({ assignedToId: "p-lead" }));
  });

  it("falls back to groupMembers.edit staff when the group has no leader", async () => {
    loadGroupLeaderPersonIds.mockResolvedValue([]);
    loadPersonIdsWithPermission.mockResolvedValue(["p-admin", "p-req"]);
    const tasks = await GroupJoinRequestTaskHelper.createJoinRequestTask("c1", payload);
    expect(loadPersonIdsWithPermission).toHaveBeenCalledWith("c1", "Group Members", "Edit");
    expect(tasks).toHaveLength(1);
    expect(save.mock.calls[0][0].assignedToId).toBe("p-admin");
  });

  // Issue #1109: self-registered churches only ever get a "Domain Admins" role holding
  // {contentType: "Domain", action: "Admin"} - no literal "Group Members"/"Edit" row is
  // ever written, so the staff fallback above finds nobody and leaderless groups produced
  // no task at all.
  it("falls back to domain admins when there is no leader and no groupMembers.edit staff", async () => {
    loadGroupLeaderPersonIds.mockResolvedValue([]);
    loadPersonIdsWithPermission.mockImplementation(async (_churchId: string, contentType: string, action: string) => {
      if (contentType === "Domain" && action === "Admin") return ["p-admin", "p-req"];
      return [];
    });
    const tasks = await GroupJoinRequestTaskHelper.createJoinRequestTask("c1", payload);
    expect(loadPersonIdsWithPermission).toHaveBeenCalledWith("c1", "Group Members", "Edit");
    expect(loadPersonIdsWithPermission).toHaveBeenCalledWith("c1", "Domain", "Admin");
    expect(tasks).toHaveLength(1);
    expect(save.mock.calls[0][0].assignedToId).toBe("p-admin");
  });

  it("creates nothing when there is nobody to assign", async () => {
    loadGroupLeaderPersonIds.mockResolvedValue([]);
    loadPersonIdsWithPermission.mockResolvedValue([]);
    const tasks = await GroupJoinRequestTaskHelper.createJoinRequestTask("c1", payload);
    expect(tasks).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });

  it("closes only open tasks for that request id", async () => {
    loadOpenByTaskType.mockResolvedValue([
      { id: "t1", data: JSON.stringify({ requestId: "req1" }), status: "Open" },
      { id: "t2", data: JSON.stringify({ requestId: "other" }), status: "Open" },
      { id: "t3", data: "not-json", status: "Open" }
    ]);
    await GroupJoinRequestTaskHelper.closeJoinRequestTask("c1", { id: "req1" });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].id).toBe("t1");
    expect(save.mock.calls[0][0].status).toBe("Closed");
    expect(save.mock.calls[0][0].dateClosed).toBeInstanceOf(Date);
  });

  it("does not scan tasks when the decided payload has no request id", async () => {
    await GroupJoinRequestTaskHelper.closeJoinRequestTask("c1", { personId: "p-req" });
    expect(loadOpenByTaskType).not.toHaveBeenCalled();
  });

  it("routes bus events to create and close", async () => {
    loadGroupLeaderPersonIds.mockResolvedValue(["p-lead"]);
    await GroupJoinRequestTaskHelper.onEvent("c1", "group.member.requested", payload);
    expect(save).toHaveBeenCalled();
    save.mockClear();
    loadOpenByTaskType.mockResolvedValue([{ id: "t1", data: JSON.stringify({ requestId: "req1" }), status: "Open" }]);
    await GroupJoinRequestTaskHelper.onEvent("c1", "group.joinRequest.decided", { id: "req1" });
    expect(save.mock.calls[0][0].status).toBe("Closed");
  });
});
