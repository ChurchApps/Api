import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  Permissions: { groupMembers: { view: "gmView", edit: "gmEdit" } },
  UserChurchHelper: { createForGroupMember: jest.fn() }
}));
jest.mock("../../models/requests", () => ({}));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getAll: () => [], getIds: () => [] } }));

import { GroupMemberController } from "../GroupMemberController.js";

function rosterRow(personId: string, groupId = "g1") {
  return {
    id: "gm-" + personId,
    groupId,
    personId,
    leader: false,
    person: {
      id: personId,
      name: { display: "Person " + personId },
      contactInfo: { email: personId + "@x.org", mobilePhone: "555", address1: "1 Main" },
      householdId: "h1",
      householdRole: "Head"
    }
  };
}

function gmController(opts: any = {}) {
  const repos: any = {
    group: { load: jest.fn(async () => opts.group ?? { id: "g1" }) },
    groupMember: {
      loadForGroup: jest.fn(async () => opts.rows ?? []),
      loadForGroups: jest.fn(async () => opts.rows ?? []),
      loadForPerson: jest.fn(async () => opts.rows ?? []),
      loadAll: jest.fn(async () => opts.rows ?? []),
      convertAllToModel: (_c: string, r: any[]) => r
    }
  };
  const au = { churchId: "c1", personId: opts.personId ?? "p1", groupIds: opts.groupIds ?? [], leaderGroupIds: opts.leaderGroupIds ?? [], checkAccess: (perm: any) => (opts.access ?? []).includes(perm) };
  const controller = new GroupMemberController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

describe("GroupMemberController.getAll roster contact privacy", () => {
  it("strips contact and household fields for an ordinary member of the group", async () => {
    const { controller } = gmController({ groupIds: ["g1"], rows: [rosterRow("p2"), rosterRow("p3")] });
    const result = await (controller as any).getAll({ query: { groupId: "g1" } }, {});
    expect(result).toHaveLength(2);
    result.forEach((gm: any) => {
      expect(gm.person.name.display).toBeDefined();
      expect(gm.person.contactInfo).toBeUndefined();
      expect(gm.person.householdId).toBeUndefined();
      expect(gm.person.householdRole).toBeUndefined();
    });
  });

  it("keeps contact fields for a leader of that group", async () => {
    const { controller } = gmController({ groupIds: ["g1"], leaderGroupIds: ["g1"], rows: [rosterRow("p2")] });
    const result = await (controller as any).getAll({ query: { groupId: "g1" } }, {});
    expect(result[0].person.contactInfo.email).toBe("p2@x.org");
    expect(result[0].person.householdId).toBe("h1");
  });

  it("keeps contact fields for staff with groupMembers.view", async () => {
    const { controller } = gmController({ access: ["gmView"], rows: [rosterRow("p2")] });
    const result = await (controller as any).getAll({ query: { groupId: "g1" } }, {});
    expect(result[0].person.contactInfo.email).toBe("p2@x.org");
  });

  it("a leader of one group still gets a stripped roster for a group they only belong to", async () => {
    const { controller } = gmController({ groupIds: ["g1", "g2"], leaderGroupIds: ["g2"], rows: [rosterRow("p2", "g1")] });
    const result = await (controller as any).getAll({ query: { groupId: "g1" } }, {});
    expect(result[0].person.contactInfo).toBeUndefined();
  });

  it("still blocks a caller who is neither staff nor a member of the group (401)", async () => {
    const { controller, repos } = gmController({ groupIds: ["other"] });
    const result = await (controller as any).getAll({ query: { groupId: "g1" } }, {});
    expect(result.status).toBe(401);
    expect(repos.groupMember.loadForGroup).not.toHaveBeenCalled();
  });
});
