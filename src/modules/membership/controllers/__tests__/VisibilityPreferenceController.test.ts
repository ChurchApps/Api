import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));

import express from "express";
import { VisibilityPreferenceController } from "../VisibilityPreferenceController.js";
import { VisibilityPreference } from "../../models/index.js";

const res = {} as express.Response;
const asRequest = <B>(partial: Partial<express.Request<{}, {}, B>>) => partial as express.Request<{}, {}, B>;

function vpController(opts: { pref?: VisibilityPreference } = {}) {
  const repos = {
    visibilityPreference: {
      loadForPerson: jest.fn(async () => opts.pref ?? null),
      save: jest.fn(async (v: VisibilityPreference) => ({ ...v, id: v.id || "genV" }))
    }
  };
  const au = { churchId: "c1", personId: "p1" };
  const controller = new VisibilityPreferenceController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (user: typeof au) => unknown) => action(au)
  });
  return { controller, repos };
}

describe("VisibilityPreferenceController.loadMy", () => {
  it("returns the caller's stored preference row so the profile page can show the chosen levels", async () => {
    const pref = { id: "v1", churchId: "c1", personId: "p1", address: "leaders", phoneNumber: "staff", email: "staff" };
    const { controller, repos } = vpController({ pref });
    const result = await controller.loadMy(asRequest<[]>({}), res);
    expect(repos.visibilityPreference.loadForPerson).toHaveBeenCalledWith("c1", "p1");
    expect(result).toEqual(pref);
  });

  it("returns an empty list when the caller has never saved a preference", async () => {
    const { controller } = vpController();
    const result = await controller.loadMy(asRequest<[]>({}), res);
    expect(result).toEqual([]);
  });
});

describe("VisibilityPreferenceController.save", () => {
  it("stamps churchId and personId from the token and accepts the new levels", async () => {
    const { controller, repos } = vpController();
    const result = (await controller.save(asRequest<VisibilityPreference[]>({ body: [{ address: "leaders", phoneNumber: "staff", email: "staff" }] }), res)) as VisibilityPreference[];
    expect(repos.visibilityPreference.save).toHaveBeenCalledWith(expect.objectContaining({ churchId: "c1", personId: "p1", address: "leaders", phoneNumber: "staff", email: "staff" }));
    expect(result[0].id).toBe("genV");
  });
});
