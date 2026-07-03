/** Tests delegated authorization for the "doing" module: ministry members can edit without global Plans:Edit. */

jest.mock("@churchapps/apihelper", () => ({ BasePermissions: class {} }));

const loadGroupMembersForPersonMock = jest.fn();
const loadPlanMock = jest.fn();
const loadPlanTypeMock = jest.fn();
const loadPositionMock = jest.fn();

jest.mock("../../modules/index.js", () => ({
  getMembershipModuleGateway: () => ({ loadGroupMembersForPerson: loadGroupMembersForPersonMock }),
  getDoingModuleGateway: () => ({
    loadPlan: loadPlanMock,
    loadPlanType: loadPlanTypeMock,
    loadPosition: loadPositionMock
  })
}));

import { PlanAuth } from "../PlanAuth.js";

function au(overrides: { hasEditAccess?: boolean; personId?: string | null } = {}) {
  const { hasEditAccess = false, personId = "person1" } = overrides;
  return { checkAccess: jest.fn().mockReturnValue(hasEditAccess), churchId: "church1", personId } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("PlanAuth.canEditMinistry", () => {
  it("allows anyone with global Plans:Edit access, even with no ministryId", async () => {
    expect(await PlanAuth.canEditMinistry(au({ hasEditAccess: true }), undefined)).toBe(true);
    expect(loadGroupMembersForPersonMock).not.toHaveBeenCalled();
  });

  it("denies when there is no ministryId and no global access", async () => {
    expect(await PlanAuth.canEditMinistry(au(), null)).toBe(false);
  });

  it("denies when the user has no personId", async () => {
    expect(await PlanAuth.canEditMinistry(au({ personId: null }), "min1")).toBe(false);
    expect(loadGroupMembersForPersonMock).not.toHaveBeenCalled();
  });

  it("allows a member of the ministry's group", async () => {
    loadGroupMembersForPersonMock.mockResolvedValue([{ groupId: "other" }, { groupId: "min1" }]);
    expect(await PlanAuth.canEditMinistry(au(), "min1")).toBe(true);
    expect(loadGroupMembersForPersonMock).toHaveBeenCalledWith("church1", "person1");
  });

  it("denies a person who belongs only to unrelated groups", async () => {
    loadGroupMembersForPersonMock.mockResolvedValue([{ groupId: "other" }]);
    expect(await PlanAuth.canEditMinistry(au(), "min1")).toBe(false);
  });

  it("denies safely when the membership gateway returns a non-array", async () => {
    loadGroupMembersForPersonMock.mockResolvedValue(null);
    expect(await PlanAuth.canEditMinistry(au(), "min1")).toBe(false);
  });
});

describe("PlanAuth.canEditPlan", () => {
  it("allows anyone with global Plans:Edit access without loading the plan", async () => {
    expect(await PlanAuth.canEditPlan(au({ hasEditAccess: true }), "plan1")).toBe(true);
    expect(loadPlanMock).not.toHaveBeenCalled();
  });

  it("denies when there is no planId", async () => {
    expect(await PlanAuth.canEditPlan(au(), undefined)).toBe(false);
  });

  it("allows a member of the plan's ministry group", async () => {
    loadPlanMock.mockResolvedValue({ ministryId: "min1" });
    loadGroupMembersForPersonMock.mockResolvedValue([{ groupId: "min1" }]);
    expect(await PlanAuth.canEditPlan(au(), "plan1")).toBe(true);
    expect(loadPlanMock).toHaveBeenCalledWith("church1", "plan1");
  });

  it("denies when the plan does not resolve to a ministry the user belongs to", async () => {
    loadPlanMock.mockResolvedValue(null);
    expect(await PlanAuth.canEditPlan(au(), "plan1")).toBe(false);
    expect(loadGroupMembersForPersonMock).not.toHaveBeenCalled();
  });
});

describe("PlanAuth.canEditPlanType", () => {
  it("allows anyone with global Plans:Edit access without loading the plan type", async () => {
    expect(await PlanAuth.canEditPlanType(au({ hasEditAccess: true }), "pt1")).toBe(true);
    expect(loadPlanTypeMock).not.toHaveBeenCalled();
  });

  it("denies when there is no planTypeId", async () => {
    expect(await PlanAuth.canEditPlanType(au(), undefined)).toBe(false);
  });

  it("allows a member of the plan type's ministry group", async () => {
    loadPlanTypeMock.mockResolvedValue({ ministryId: "min1" });
    loadGroupMembersForPersonMock.mockResolvedValue([{ groupId: "min1" }]);
    expect(await PlanAuth.canEditPlanType(au(), "pt1")).toBe(true);
    expect(loadPlanTypeMock).toHaveBeenCalledWith("church1", "pt1");
  });

  it("denies a member of an unrelated ministry group", async () => {
    loadPlanTypeMock.mockResolvedValue({ ministryId: "min1" });
    loadGroupMembersForPersonMock.mockResolvedValue([{ groupId: "min2" }]);
    expect(await PlanAuth.canEditPlanType(au(), "pt1")).toBe(false);
  });
});

describe("PlanAuth.canEditPosition", () => {
  it("allows anyone with global Plans:Edit access without loading the position", async () => {
    expect(await PlanAuth.canEditPosition(au({ hasEditAccess: true }), "pos1")).toBe(true);
    expect(loadPositionMock).not.toHaveBeenCalled();
  });

  it("denies when there is no positionId", async () => {
    expect(await PlanAuth.canEditPosition(au(), undefined)).toBe(false);
  });

  it("delegates through the position's plan to the ministry membership check", async () => {
    loadPositionMock.mockResolvedValue({ planId: "plan1" });
    loadPlanMock.mockResolvedValue({ ministryId: "min1" });
    loadGroupMembersForPersonMock.mockResolvedValue([{ groupId: "min1" }]);
    expect(await PlanAuth.canEditPosition(au(), "pos1")).toBe(true);
    expect(loadPositionMock).toHaveBeenCalledWith("church1", "pos1");
    expect(loadPlanMock).toHaveBeenCalledWith("church1", "plan1");
  });

  it("denies when the position's plan belongs to a different ministry", async () => {
    loadPositionMock.mockResolvedValue({ planId: "plan1" });
    loadPlanMock.mockResolvedValue({ ministryId: "min1" });
    loadGroupMembersForPersonMock.mockResolvedValue([{ groupId: "min2" }]);
    expect(await PlanAuth.canEditPosition(au(), "pos1")).toBe(false);
  });

  it("denies safely when the position does not resolve", async () => {
    loadPositionMock.mockResolvedValue(null);
    expect(await PlanAuth.canEditPosition(au(), "pos1")).toBe(false);
    expect(loadPlanMock).not.toHaveBeenCalled();
  });
});
