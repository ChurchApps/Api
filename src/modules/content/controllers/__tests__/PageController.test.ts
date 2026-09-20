import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("../../helpers/TreeHelper", () => ({
  TreeHelper: {
    populateAnswers: () => {},
    buildTree: (sections: any[]) => sections,
    insertBlocks: async () => {},
    duplicateSection: jest.fn(async (s: any) => s)
  }
}));
jest.mock("../../helpers/index", () => ({
  Permissions: { content: { edit: { contentType: "Content", action: "Edit" } } },
  ...jest.requireActual("../../helpers/PageVisibilityHelper")
}));
jest.mock("../ContentBaseController", () => ({
  ContentBaseController: class {
    json(obj: any, status: number) { return { obj, status }; }
    bumpSiteCache() {}
    authUser(): any { return null; }
  }
}));

import { PageController2 } from "../PageController.js";
import { TreeHelper } from "../../helpers/TreeHelper.js";

const EDIT_PERMISSION = "Content__Edit";

function makeAu(churchId: string, permissions: string[] = [EDIT_PERMISSION]) {
  return { churchId, personId: "p1", permissions, checkAccess: (p: any) => permissions.includes(p.contentType + "__" + p.action) };
}

function makeController(page: any, au: any = null) {
  const repos = {
    page: {
      load: jest.fn(async () => page),
      loadByUrl: jest.fn(async () => page),
      loadPublished: jest.fn(async () => ({ publishedJSON: JSON.stringify({ sections: [{ id: "snap1", churchId: "c1", pageId: "pg1", sort: 1, elements: [] }] }) }))
    },
    section: { loadForPage: jest.fn(async () => [{ id: "s1", churchId: "c1", pageId: "pg1", sort: 1, elements: [{ id: "e1", churchId: "c1", sectionId: "s1", sort: 1, answersJSON: "{}" }] }]) },
    element: { loadForPage: jest.fn(async () => [{ id: "e1", churchId: "c1", sectionId: "s1", sort: 1, answersJSON: "{}" }]) }
  };
  const controller = new PageController2();
  (controller as any).repos = repos;
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).authUser = () => au;
  return { controller, repos };
}

const getTree = (controller: PageController2, query: any, churchId = "c1") => (controller as any).getTree(churchId, { query }, {});

const membersPage = () => ({ id: "pg1", churchId: "c1", url: "/members", visibility: "members", siteId: "site1" });
const publicPage = (extra: any = {}) => ({ id: "pg1", churchId: "c1", url: "/home", visibility: "everyone", siteId: "site1", ...extra });

describe("PageController2.getTree visibility gating", () => {
  it("gates an anonymous ?id= load of a restricted page", async () => {
    const { controller, repos } = makeController(membersPage(), null);
    const result = await getTree(controller, { id: "pg1" });
    expect(result).toEqual({ restricted: true, visibility: "members" });
    expect(repos.section.loadForPage).not.toHaveBeenCalled();
  });

  it("strips internal fields from an anonymous ?id= load of a public page", async () => {
    const { controller } = makeController(publicPage({ groupIds: '["g1"]' }), null);
    const result = await getTree(controller, { id: "pg1" });
    expect(result.churchId).toBeUndefined();
    expect(result.groupIds).toBeUndefined();
    expect(result.sections[0].churchId).toBeUndefined();
    expect(result.sections[0].elements[0].churchId).toBeUndefined();
  });

  it("serves the published snapshot for an anonymous ?id= load", async () => {
    const { controller, repos } = makeController(publicPage({ publishedAt: new Date() }), null);
    const result = await getTree(controller, { id: "pg1" });
    expect(repos.page.loadPublished).toHaveBeenCalled();
    expect(repos.section.loadForPage).not.toHaveBeenCalled();
    expect(result.sections).toHaveLength(1);
  });

  it("gives a same-church content editor the unstripped working tree of a restricted page", async () => {
    const page = membersPage();
    const { controller, repos } = makeController(page, makeAu("c1"));
    const result = await getTree(controller, { id: "pg1" });
    expect(result.restricted).toBeUndefined();
    expect(result.churchId).toBe("c1");
    expect(result.sections[0].churchId).toBe("c1");
    expect(repos.section.loadForPage).toHaveBeenCalled();
  });

  it("gives an editor the working tree even when the page is published", async () => {
    const { controller, repos } = makeController(publicPage({ publishedAt: new Date() }), makeAu("c1"));
    await getTree(controller, { id: "pg1" });
    expect(repos.page.loadPublished).not.toHaveBeenCalled();
    expect(repos.section.loadForPage).toHaveBeenCalled();
  });

  it("treats a JWT from another church as public", async () => {
    const { controller } = makeController(membersPage(), makeAu("c2"));
    const result = await getTree(controller, { id: "pg1" });
    expect(result).toEqual({ restricted: true, visibility: "members" });
  });

  it("treats a same-church JWT without content-edit as public (passes the members gate but is stripped)", async () => {
    const { controller } = makeController(membersPage(), makeAu("c1", []));
    const result = await getTree(controller, { id: "pg1" });
    expect(result.restricted).toBeUndefined();
    expect(result.churchId).toBeUndefined();
    expect(result.sections[0].churchId).toBeUndefined();
  });

  it("gates a same-church non-editor out of a staff-only page", async () => {
    const { controller } = makeController({ ...membersPage(), visibility: "staff" }, makeAu("c1", []));
    const result = await getTree(controller, { id: "pg1" });
    expect(result).toEqual({ restricted: true, visibility: "staff" });
  });

  it("still gates and strips url-based loads regardless of the JWT", async () => {
    const { controller } = makeController(membersPage(), makeAu("c1"));
    const result = await getTree(controller, { url: "members", id: "pg1" });
    expect(result.restricted).toBeUndefined();
    expect(result.churchId).toBeUndefined();
  });

  it("gates a url-based load for an anonymous visitor", async () => {
    const { controller } = makeController(membersPage(), null);
    const result = await getTree(controller, { url: "members" });
    expect(result).toEqual({ restricted: true, visibility: "members" });
  });
});

describe("PageController2.importTree", () => {
  const body = () => ({
    id: "evil",
    churchId: "other",
    title: "Home",
    url: "/home",
    sections: [{ id: "x", churchId: "other", background: "#fff", elements: [{ id: "y", churchId: "other", elementType: "row", answersJSON: "{}", elements: [{ elementType: "column", answersJSON: "{}" }] }] }]
  });
  const run = (au: any, b: any) => {
    const controller = new PageController2();
    const save = jest.fn(async (p: any) => ({ ...p, id: "pg9" }));
    (controller as any).repos = { page: { save } };
    (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
    return (controller as any).importTree({ body: b }, {}).then((result: any) => ({ result, save }));
  };

  it("rejects callers without content edit", async () => {
    const { result, save } = await run(makeAu("c1", []), body());
    expect(result.status).toBe(401);
    expect(save).not.toHaveBeenCalled();
  });

  it("always inserts under the caller's church, ignoring body ids and churchId", async () => {
    (TreeHelper.duplicateSection as jest.Mock).mockClear();
    const { result, save } = await run(makeAu("c1"), body());
    expect(result.id).toBe("pg9");
    expect(save.mock.calls[0][0]).toEqual({ churchId: "c1", siteId: "", title: "Home", url: "/home", layout: "headerFooter" });
    const section = (TreeHelper.duplicateSection as jest.Mock).mock.calls[0][0];
    expect(section).toMatchObject({ churchId: "c1", pageId: "pg9", sort: 1 });
    expect(section.id).toBeUndefined();
    expect(section.elements[0]).toMatchObject({ churchId: "c1", elementType: "row", sort: 1 });
    expect(section.elements[0].id).toBeUndefined();
    expect(section.elements[0].elements[0]).toMatchObject({ churchId: "c1", elementType: "column" });
  });

  it("rejects invalid answersJSON before saving anything", async () => {
    const b = body();
    b.sections[0].elements[0].answersJSON = "{nope";
    const { result, save } = await run(makeAu("c1"), b);
    expect(result.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });
});
