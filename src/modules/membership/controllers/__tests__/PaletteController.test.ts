import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class {} }));
jest.mock("../../helpers/index", () => ({ Permissions: {} }));
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("../../../../shared/modules/DoingModuleGateway.js", () => ({ getDoingModuleGateway: jest.fn() }));
jest.mock("../../../../shared/modules/GivingModuleGateway.js", () => ({ getGivingModuleGateway: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({}));

import { staticItems } from "../PaletteController.js";

const none = { people: false, peopleEdit: false, giving: false, givingView: false, givingEdit: false, attendance: false, content: false, sermons: false, settings: false, roles: false, forms: false, plans: false, serverAdmin: false };

describe("palette static items", () => {
  it("volunteer sees no giving, people or settings rows", () => {
    const urls = staticItems(none).map((i) => i.u);
    expect(urls).toEqual([
      "/", "/groups", "/groups/pending", "/groups/health", "/serving/tasks", "/serving/tasks/workflows", "/profile", "/profile/devices"
    ]);
    expect(staticItems(none).flatMap((i) => i.a || [])).not.toContain("giving");
  });

  it("treasurer gets Donations with giving aliases", () => {
    const items = staticItems({ ...none, giving: true });
    expect(items.find((i) => i.u === "/donations")?.a).toContain("tithes");
  });

  it("roles.view without settings.edit gets Roles but not Settings", () => {
    const urls = staticItems({ ...none, roles: true }).map((i) => i.u);
    expect(urls).toContain("/settings/roles");
    expect(urls).not.toContain("/settings");
    expect(staticItems({ ...none, settings: true }).map((i) => i.u)).toEqual(expect.arrayContaining(["/settings", "/settings/roles", "/settings#campuses", "/mobile/checkin/labels"]));
  });

  it("content.edit gets every site and calendar sub page", () => {
    const urls = staticItems({ ...none, content: true }).map((i) => i.u);
    expect(urls).toEqual(expect.arrayContaining([
      "/site/pages", "/site/blog", "/site/blocks", "/site/appearance", "/site/files", "/calendars/rooms", "/registrations", "/mobile/navigation"
    ]));
    expect(staticItems({ ...none, content: true }).find((i) => i.u === "/site/blog")?.a).toContain("blogs");
  });

  it("failed donations and stripe import follow view/edit, not viewSummary", () => {
    const summary = staticItems({ ...none, giving: true }).map((i) => i.u);
    expect(summary).toContain("/donations/statements");
    expect(summary).not.toContain("/donations/failed");
    expect(staticItems({ ...none, givingView: true }).map((i) => i.u)).toContain("/donations/failed");
    expect(staticItems({ ...none, givingEdit: true }).map((i) => i.u)).toContain("/donations/stripe-import");
  });

  it("urls are unique", () => {
    const all = { people: true, peopleEdit: true, giving: true, givingView: true, givingEdit: true, attendance: true, content: true, sermons: true, settings: true, roles: true, forms: true, plans: true, serverAdmin: true };
    const urls = staticItems(all).map((i) => i.u);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("#addPerson needs people.edit", () => {
    expect(staticItems({ ...none, people: true }).some((i) => i.u === "#addPerson")).toBe(false);
    expect(staticItems({ ...none, peopleEdit: true }).some((i) => i.u === "#addPerson")).toBe(true);
  });
});
