import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({
  Permissions: { groupMembers: { view: "gmView", edit: "gmEdit" }, groups: { edit: "groupsEdit" }, plans: { edit: "plansEdit" } },
  UserChurchHelper: { createForGroupMember: jest.fn() }
}));
jest.mock("../../models/requests", () => ({}));
jest.mock("../../../../shared/webhooks/index", () => ({ WebhookDispatcher: { emit: jest.fn() } }));
jest.mock("@churchapps/apihelper", () => ({ ArrayHelper: { getAll: (): unknown[] => [], getIds: (): string[] => [] }, SlugHelper: { slugifyString: (s: string) => s } }));
jest.mock("../../../../shared/infrastructure/KyselyPool", () => ({ KyselyPool: { getDb: jest.fn() } }));

import type express from "express";
import { GroupController } from "../GroupController.js";
import { Group } from "../../models/index.js";

const req = {} as express.Request;
const res = {} as express.Response;

const allGroups = [
  { id: "g1", name: "Sunday School", tags: "standard", confidential: false },
  { id: "g2", name: "Worship Team", tags: "team", confidential: false },
  { id: "g3", name: "Outreach Ministry", tags: "ministry", confidential: false },
  { id: "g4", name: "Untagged Group", tags: "", confidential: false },
  { id: "g5", name: "Confidential Standard Group", tags: "standard", confidential: true }
];

function grpController() {
  const repos = {
    group: {
      loadAll: jest.fn(async () => allGroups),
      loadByTag: jest.fn(async (_churchId: string, tag: string) => allGroups.filter((g) => (g.tags || "").indexOf(tag) > -1)),
      convertAllToModel: (_c: string, rows: typeof allGroups) => rows
    }
  };
  const controller = new GroupController();
  Object.assign(controller, {
    repos,
    actionWrapperAnon: (_req: express.Request, _res: express.Response, action: () => Promise<unknown>) => action(),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, repos };
}

describe("GroupController.getPublicList", () => {
  it("calls loadByTag with 'standard' instead of loadAll", async () => {
    const { controller, repos } = grpController();
    await controller.getPublicList("c1", req, res);
    expect(repos.group.loadByTag).toHaveBeenCalledWith("c1", "standard");
    expect(repos.group.loadAll).not.toHaveBeenCalled();
  });

  it("only returns standard-tagged groups, excluding team/ministry/untagged groups", async () => {
    const { controller } = grpController();
    const result = (await controller.getPublicList("c1", req, res)) as Group[];
    const ids = result.map((g) => g.id);
    expect(ids).toContain("g1");
    expect(ids).not.toContain("g2");
    expect(ids).not.toContain("g3");
    expect(ids).not.toContain("g4");
  });

  it("still excludes confidential groups even when standard-tagged", async () => {
    const { controller } = grpController();
    const result = (await controller.getPublicList("c1", req, res)) as Group[];
    const ids = result.map((g) => g.id);
    expect(ids).not.toContain("g5");
  });
});
