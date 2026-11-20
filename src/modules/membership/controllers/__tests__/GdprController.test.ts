import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { people: { edit: "peopleEdit", viewConfidentialNotes: "peopleViewConfidentialNotes" } } }));

const exportPersonData = jest.fn(async (..._args: unknown[]) => ({ exportedAt: "now" }));
jest.mock("../../helpers/GdprExportHelper", () => ({ GdprExportHelper: { exportPersonData: (...args: unknown[]) => exportPersonData.apply(null, args) } }));
jest.mock("../../helpers/GdprErasureHelper", () => ({ GdprErasureHelper: { anonymize: jest.fn() } }));
jest.mock("../../../../shared/webhooks/WebhookDispatcher", () => ({ WebhookDispatcher: { emit: jest.fn() } }));

import express from "express";
import { GdprController } from "../GdprController.js";

const res = {} as express.Response;
const asRequest = (partial: Partial<express.Request>) => partial as express.Request;

function makeController(access: string[]) {
  const controller = new GdprController();
  Object.assign(controller, {
    repos: { repos: true },
    actionWrapper: (_req: express.Request, _res: express.Response, action: (au: { churchId: string; checkAccess: (perm: string) => boolean }) => unknown) =>
      action({ churchId: "c1", checkAccess: (perm: string) => access.includes(perm) }),
    denyAccess: () => ({ status: 401 })
  });
  return controller;
}

describe("GdprController.exportPerson", () => {
  beforeEach(() => exportPersonData.mockClear());

  it("denies a caller without people edit", async () => {
    const result = await makeController([]).exportPerson(asRequest({ params: { personId: "p1" } }), res);
    expect(result).toEqual({ status: 401 });
    expect(exportPersonData).not.toHaveBeenCalled();
  });

  it("exports without confidential notes for a plain people-edit caller", async () => {
    await makeController(["peopleEdit"]).exportPerson(asRequest({ params: { personId: "p1" } }), res);
    expect(exportPersonData).toHaveBeenCalledWith("c1", "p1", { repos: true }, { includeConfidentialNotes: false });
  });

  it("exports with confidential notes when the caller holds that permission", async () => {
    await makeController(["peopleEdit", "peopleViewConfidentialNotes"]).exportPerson(asRequest({ params: { personId: "p1" } }), res);
    expect(exportPersonData).toHaveBeenCalledWith("c1", "p1", { repos: true }, { includeConfidentialNotes: true });
  });
});
