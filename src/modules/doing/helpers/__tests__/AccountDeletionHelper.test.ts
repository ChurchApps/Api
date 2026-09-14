import "reflect-metadata";

const loadSetting = jest.fn();
const loadGroup = jest.fn();
const loadPerson = jest.fn();
const loadGroupMemberPersonIds = jest.fn();
const anonymizePerson = jest.fn();
jest.mock("../../../../shared/modules/index", () => ({ getMembershipModuleGateway: () => ({ loadSetting, loadGroup, loadPerson, loadGroupMemberPersonIds, anonymizePerson }) }));

const notifyMock = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../../shared/helpers/NotificationService.js", () => ({ NotificationService: { createNotifications: (...args: unknown[]) => notifyMock(...args) } }));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { b1AdminRoot: "https://admin.test" } }));

import { AccountDeletionHelper } from "../AccountDeletionHelper.js";

const au = { churchId: "c1", personId: "p1", firstName: "Donald", lastName: "Clark" };

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function openTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    churchId: "c1",
    taskType: "accountDeletion",
    status: "Open",
    associatedWithType: "person",
    associatedWithId: "p1",
    associatedWithLabel: "Donald Clark",
    createdByType: "person",
    createdById: "p1",
    createdByLabel: "Donald Clark",
    assignedToType: "group",
    assignedToId: "g9",
    assignedToLabel: "Staff",
    title: "Account deletion request from Donald Clark",
    data: JSON.stringify({ outcome: "pending" }),
    dateCreated: daysAgo(2),
    ...overrides
  };
}

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
    expect(task.dueDate).toBeInstanceOf(Date);
  });
});

describe("AccountDeletionHelper.completeDecision", () => {
  let repos: { task: { save: jest.Mock } };

  beforeEach(() => {
    notifyMock.mockReset().mockResolvedValue(undefined);
    anonymizePerson.mockReset().mockResolvedValue(undefined);
    loadPerson.mockReset().mockResolvedValue({ id: "p1", email: "donald@example.com", displayName: "Donald Clark" });
    repos = { task: { save: jest.fn(async (t: any) => t) } };
  });

  it("refuses a rejection that has no reason", async () => {
    const result = await AccountDeletionHelper.completeDecision(openTask(), { outcome: "rejected" }, repos);
    expect(result.error).toMatch(/reason/i);
    expect(repos.task.save).not.toHaveBeenCalled();
    expect(anonymizePerson).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("refuses a rejection whose reason is too short", async () => {
    const result = await AccountDeletionHelper.completeDecision(openTask(), { outcome: "rejected", reason: "no" }, repos);
    expect(result.error).toMatch(/reason/i);
    expect(repos.task.save).not.toHaveBeenCalled();
  });

  it("closes a rejection, keeps the record, and tells the member why", async () => {
    const reason = "We are required by law to keep donation records.";
    const result = await AccountDeletionHelper.completeDecision(openTask(), { outcome: "rejected", reason }, repos);
    expect(result.error).toBeUndefined();
    expect(anonymizePerson).not.toHaveBeenCalled();
    expect(repos.task.save).toHaveBeenCalledTimes(1);
    const saved = repos.task.save.mock.calls[0][0];
    expect(saved.status).toBe("Closed");
    const data = JSON.parse(saved.data);
    expect(data.outcome).toBe("rejected");
    expect(data.reason).toBe(reason);
    expect(notifyMock).toHaveBeenCalledTimes(1);
    const [ids, churchId, contentType, contentId, message] = notifyMock.mock.calls[0];
    expect(ids).toEqual(["p1"]);
    expect(churchId).toBe("c1");
    expect(contentType).toBe("task");
    expect(contentId).toBe("t1");
    expect(message).toContain(reason);
    expect(message).toMatch(/supervisory|authority|complain/i);
  });

  it("anonymizes first on approve, then tells the member using the email snapshot", async () => {
    const result = await AccountDeletionHelper.completeDecision(openTask(), { outcome: "approved" }, repos);
    expect(result.error).toBeUndefined();
    expect(anonymizePerson).toHaveBeenCalledWith("c1", "p1");
    expect(repos.task.save).toHaveBeenCalledTimes(1);
    expect(JSON.parse(repos.task.save.mock.calls[0][0].data).outcome).toBe("approved");
    expect(notifyMock).toHaveBeenCalled();
    const call = notifyMock.mock.calls[0];
    expect(call[0]).toEqual(["p1"]);
    expect(call[4]).toMatch(/anonymized|removed/i);
    expect(call[7].emailImmediate).toBe(true);
    expect(call[7].emailByPerson.p1.subject).toBeTruthy();
    expect(anonymizePerson.mock.invocationCallOrder[0]).toBeLessThan(notifyMock.mock.invocationCallOrder[0]);
  });

  it("does not close the task if anonymize fails", async () => {
    anonymizePerson.mockRejectedValue(new Error("db down"));
    const result = await AccountDeletionHelper.completeDecision(openTask(), { outcome: "approved" }, repos);
    expect(result.error).toBeTruthy();
    expect(repos.task.save).not.toHaveBeenCalled();
  });
});

describe("AccountDeletionHelper.notifyReviewers", () => {
  beforeEach(() => {
    notifyMock.mockReset().mockResolvedValue(undefined);
    loadGroupMemberPersonIds.mockReset().mockResolvedValue(["s1", "s2", "p1"]);
  });

  it("pings the approval group except the requester", async () => {
    await AccountDeletionHelper.notifyReviewers(openTask());
    expect(loadGroupMemberPersonIds).toHaveBeenCalledWith("c1", "g9");
    expect(notifyMock).toHaveBeenCalledTimes(1);
    const [ids, , , , message, link] = notifyMock.mock.calls[0];
    expect(ids.sort()).toEqual(["s1", "s2"]);
    expect(message).toMatch(/Donald Clark/);
    expect(link).toBe("https://admin.test/serving/tasks/t1");
  });
});

describe("AccountDeletionHelper.remindPending", () => {
  let repos: { task: { loadOpenAccountDeletions: jest.Mock; save: jest.Mock } };

  beforeEach(() => {
    notifyMock.mockReset().mockResolvedValue(undefined);
    loadGroupMemberPersonIds.mockReset().mockResolvedValue(["s1"]);
    repos = {
      task: {
        loadOpenAccountDeletions: jest.fn(),
        save: jest.fn(async (t: any) => t)
      }
    };
  });

  it("does not remind a request filed fewer than 21 days ago", async () => {
    repos.task.loadOpenAccountDeletions.mockResolvedValue([openTask({ dateCreated: daysAgo(10) })]);
    const result = await AccountDeletionHelper.remindPending(repos);
    expect(result.reminded).toBe(0);
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("reminds the approval group once a request is 21 days old", async () => {
    repos.task.loadOpenAccountDeletions.mockResolvedValue([openTask({ dateCreated: daysAgo(21) })]);
    const result = await AccountDeletionHelper.remindPending(repos);
    expect(result.reminded).toBe(1);
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock.mock.calls[0][0]).toEqual(["s1"]);
    expect(notifyMock.mock.calls[0][4]).toMatch(/30 days|still open/i);
    const saved = repos.task.save.mock.calls[0][0];
    expect(JSON.parse(saved.data).reminderCount).toBe(1);
  });

  it("does not remind again until 27 days, then sends a second reminder", async () => {
    const once = openTask({ dateCreated: daysAgo(22), data: JSON.stringify({ outcome: "pending", reminderCount: 1 }) });
    repos.task.loadOpenAccountDeletions.mockResolvedValue([once]);
    expect((await AccountDeletionHelper.remindPending(repos)).reminded).toBe(0);

    repos.task.loadOpenAccountDeletions.mockResolvedValue([openTask({ dateCreated: daysAgo(27), data: JSON.stringify({ outcome: "pending", reminderCount: 1 }) })]);
    expect((await AccountDeletionHelper.remindPending(repos)).reminded).toBe(1);
    expect(JSON.parse(repos.task.save.mock.calls[0][0].data).reminderCount).toBe(2);
  });
});
