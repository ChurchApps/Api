import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  Permissions: { groupMembers: { view: "gmView", edit: "gmEdit" }, groups: { edit: "groupsEdit" }, plans: { edit: "plansEdit" } },
  UserChurchHelper: { createForGroupMember: jest.fn() }
}));
jest.mock("../../models/requests", () => ({}));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getAll: () => [], getIds: () => [] }, SlugHelper: { slugifyString: (s: string) => s } }));
jest.mock("../../../../shared/infrastructure/KyselyPool", () => ({ KyselyPool: { getDb: jest.fn() } }));

import { GroupController } from "../GroupController.js";

const allGroups = [
  { id: "g1", name: "Sunday School", tags: "standard", confidential: false },
  { id: "g2", name: "Worship Team", tags: "team", confidential: false },
  { id: "g3", name: "Outreach Ministry", tags: "ministry", confidential: false },
  { id: "g4", name: "Untagged Group", tags: "", confidential: false },
  { id: "g5", name: "Confidential Standard Group", tags: "standard", confidential: true }
];

function grpController() {
  const repos: any = {
    group: {
      loadAll: jest.fn(async () => allGroups),
      loadByTag: jest.fn(async (_churchId: string, tag: string) => allGroups.filter((g) => (g.tags || "").indexOf(tag) > -1)),
      convertAllToModel: (_c: string, rows: any[]) => rows
    }
  };
  const controller = new GroupController();
  (controller as any).repos = repos;
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

describe("GroupController.getPublicList", () => {
  it("calls loadByTag with 'standard' instead of loadAll", async () => {
    const { controller, repos } = grpController();
    await (controller as any).getPublicList("c1", {}, {});
    expect(repos.group.loadByTag).toHaveBeenCalledWith("c1", "standard");
    expect(repos.group.loadAll).not.toHaveBeenCalled();
  });

  it("only returns standard-tagged groups, excluding team/ministry/untagged groups", async () => {
    const { controller } = grpController();
    const result = await (controller as any).getPublicList("c1", {}, {});
    const ids = result.map((g: any) => g.id);
    expect(ids).toContain("g1");
    expect(ids).not.toContain("g2");
    expect(ids).not.toContain("g3");
    expect(ids).not.toContain("g4");
  });

  it("still excludes confidential groups even when standard-tagged", async () => {
    const { controller } = grpController();
    const result = await (controller as any).getPublicList("c1", {}, {});
    const ids = result.map((g: any) => g.id);
    expect(ids).not.toContain("g5");
  });
});
