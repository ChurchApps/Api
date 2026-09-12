import "reflect-metadata";

const loadSetting = jest.fn();
const loadGroup = jest.fn();
const loadPerson = jest.fn();
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({ loadSetting, loadGroup, loadPerson }) }));

import { AccountDeletionHelper } from "../AccountDeletionHelper.js";

const au = { churchId: "c1", personId: "p1", firstName: "Donald", lastName: "Clark" };

describe("AccountDeletionHelper.prepareRequest", () => {
  beforeEach(() => {
    loadSetting.mockReset();
    loadGroup.mockReset();
    loadPerson.mockReset();
    loadPerson.mockResolvedValue({ id: "p1", displayName: "Donald Clark" });
  });

  it("refuses when the church has no approval group configured", async () => {
    loadSetting.mockResolvedValue(null);
    const result = await AccountDeletionHelper.prepareRequest(au, { title: "x" });
    expect(result.error).toBeTruthy();
  });

  it("targets the caller and routes the request to the approval group, ignoring client-supplied identity", async () => {
    loadSetting.mockResolvedValue("g9");
    loadGroup.mockResolvedValue({ id: "g9", name: "Staff" });
    const task: any = { id: "existing", associatedWithId: "someoneElse", assignedToType: "person", assignedToId: "admin", status: "Closed", taskType: "directoryUpdate" };
    const result = await AccountDeletionHelper.prepareRequest(au, task);
    expect(result.error).toBeUndefined();
    expect(loadSetting).toHaveBeenCalledWith("c1", "directoryApprovalGroupId");
    expect(task.id).toBeUndefined();
    expect(task.taskType).toBe("accountDeletion");
    expect(task.status).toBe("Open");
    expect(task.associatedWithType).toBe("person");
    expect(task.associatedWithId).toBe("p1");
    expect(task.associatedWithLabel).toBe("Donald Clark");
    expect(task.createdByType).toBe("person");
    expect(task.createdById).toBe("p1");
    expect(task.assignedToType).toBe("group");
    expect(task.assignedToId).toBe("g9");
    expect(task.assignedToLabel).toBe("Staff");
    expect(task.title).toContain("Donald Clark");
  });
});
