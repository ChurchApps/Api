import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class {} }));
jest.mock("../../helpers/index", () => ({ Permissions: {} }));
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("../../../../shared/modules/DoingModuleGateway.js", () => ({ getDoingModuleGateway: jest.fn() }));
jest.mock("../../../../shared/modules/GivingModuleGateway.js", () => ({ getGivingModuleGateway: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({}));

import { staticItems } from "../PaletteController.js";

const none = { people: false, peopleEdit: false, giving: false, attendance: false, content: false, sermons: false, settings: false, roles: false, forms: false, plans: false };

describe("palette static items", () => {
  it("volunteer sees no giving, people or settings rows", () => {
    const urls = staticItems(none).map((i) => i.u);
    expect(urls).toEqual(["/", "/groups", "/serving/tasks"]);
    expect(staticItems(none).flatMap((i) => i.a || [])).not.toContain("giving");
  });

  it("treasurer gets Donations with giving aliases", () => {
    const items = staticItems({ ...none, giving: true });
    expect(items.find((i) => i.u === "/donations")?.a).toContain("tithes");
  });

  it("roles.view without settings.edit jumps to /settings/roles", () => {
    expect(staticItems({ ...none, roles: true }).find((i) => i.n === "Settings")?.u).toBe("/settings/roles");
    expect(staticItems({ ...none, roles: true, settings: true }).find((i) => i.n === "Settings")?.u).toBe("/settings");
  });

  it("#addPerson needs people.edit", () => {
    expect(staticItems({ ...none, people: true }).some((i) => i.u === "#addPerson")).toBe(false);
    expect(staticItems({ ...none, peopleEdit: true }).some((i) => i.u === "#addPerson")).toBe(true);
  });
});
