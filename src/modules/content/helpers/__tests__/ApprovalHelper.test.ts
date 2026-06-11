jest.mock("@churchapps/apihelper", () => ({ EmailHelper: { sendTemplatedEmail: jest.fn() } }));
jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../../../shared/modules/index.js", () => ({ getMembershipModuleGateway: jest.fn() }));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { supportEmail: "support@test", b1AdminRoot: "https://admin.test" } }));

import { ApprovalHelper } from "../ApprovalHelper.js";

describe("ApprovalHelper.determineStatus", () => {
  it("auto-approves when there is no approval group", () => {
    expect(ApprovalHelper.determineStatus(undefined, [])).toBe("approved");
    expect(ApprovalHelper.determineStatus(null, ["g1"])).toBe("approved");
  });

  it("auto-approves when the requester is a member of the approval group", () => {
    expect(ApprovalHelper.determineStatus("g1", ["g2", "g1"])).toBe("approved");
  });

  it("queues for approval when the requester is not a member", () => {
    expect(ApprovalHelper.determineStatus("g1", ["g2"])).toBe("pending");
    expect(ApprovalHelper.determineStatus("g1", [])).toBe("pending");
  });
});

describe("ApprovalHelper.buildDigests", () => {
  it("groups pending bookings by church and approval group", () => {
    const digests = ApprovalHelper.buildDigests([
      { id: "b1", churchId: "c1", roomId: "r1", roomApprovalGroupId: "g1", roomName: "Hall", eventTitle: "A", eventStart: new Date() },
      { id: "b2", churchId: "c1", roomId: "r2", roomApprovalGroupId: "g1", roomName: "Chapel", eventTitle: "B", eventStart: new Date() },
      { id: "b3", churchId: "c1", resourceId: "res1", resourceApprovalGroupId: "g2", resourceName: "Projector", eventTitle: "C", eventStart: new Date() },
      { id: "b4", churchId: "c2", roomId: "r9", roomApprovalGroupId: "g1", roomName: "Gym", eventTitle: "D", eventStart: new Date() }
    ]);
    expect(digests).toHaveLength(3);
    const first = digests.find((d) => d.churchId === "c1" && d.approvalGroupId === "g1");
    expect(first.bookingIds).toEqual(["b1", "b2"]);
    expect(first.items.map((i) => i.targetName)).toEqual(["Hall", "Chapel"]);
  });

  it("skips rows without an approval group and appends quantity to the name", () => {
    const digests = ApprovalHelper.buildDigests([
      { id: "b1", churchId: "c1", roomId: "r1", roomName: "No group", eventTitle: "A", eventStart: new Date() },
      { id: "b2", churchId: "c1", resourceId: "res1", resourceApprovalGroupId: "g1", resourceName: "Chairs", quantity: 40, eventTitle: "B", eventStart: new Date() }
    ]);
    expect(digests).toHaveLength(1);
    expect(digests[0].items[0].targetName).toBe("Chairs × 40");
  });
});
