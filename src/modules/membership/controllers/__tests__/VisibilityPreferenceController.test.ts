import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));

import { VisibilityPreferenceController } from "../VisibilityPreferenceController.js";

function vpController(opts: any = {}) {
  const repos: any = {
    visibilityPreference: {
      loadForPerson: jest.fn(async () => opts.pref ?? null),
      save: jest.fn(async (v: any) => ({ ...v, id: v.id || "genV" }))
    }
  };
  const au = { churchId: "c1", personId: "p1" };
  const controller = new VisibilityPreferenceController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  return { controller, repos };
}

describe("VisibilityPreferenceController.loadMy", () => {
  it("returns the caller's stored preference row so the profile page can show the chosen levels", async () => {
    const pref = { id: "v1", churchId: "c1", personId: "p1", address: "leaders", phoneNumber: "staff", email: "staff" };
    const { controller, repos } = vpController({ pref });
    const result = await (controller as any).loadMy({}, {});
    expect(repos.visibilityPreference.loadForPerson).toHaveBeenCalledWith("c1", "p1");
    expect(result).toEqual(pref);
  });

  it("returns an empty list when the caller has never saved a preference", async () => {
    const { controller } = vpController();
    const result = await (controller as any).loadMy({}, {});
    expect(result).toEqual([]);
  });
});

describe("VisibilityPreferenceController.save", () => {
  it("stamps churchId and personId from the token and accepts the new levels", async () => {
    const { controller, repos } = vpController();
    const result = await (controller as any).save({ body: [{ address: "leaders", phoneNumber: "staff", email: "staff" }] }, {});
    expect(repos.visibilityPreference.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1", personId: "p1", address: "leaders", phoneNumber: "staff", email: "staff" }));
    expect(result[0].id).toBe("genV");
  });
});
