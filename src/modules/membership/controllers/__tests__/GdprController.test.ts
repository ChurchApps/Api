import "reflect-metadata";
jest.mock("../MembershipBaseController", () => ({ MembershipBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { people: { edit: "peopleEdit", viewConfidentialNotes: "peopleViewConfidentialNotes" } } }));

const exportPersonData = jest.fn(async () => ({ exportedAt: "now" }));
jest.mock("../../helpers/GdprExportHelper", () => ({ GdprExportHelper: { exportPersonData: (...args: any[]) => exportPersonData.apply(null, args as any) } }));
jest.mock("../../helpers/GdprErasureHelper", () => ({ GdprErasureHelper: { anonymize: jest.fn() } }));
jest.mock("../../../../shared/webhooks/WebhookDispatcher", () => ({ WebhookDispatcher: { emit: jest.fn() } }));

import { GdprController } from "../GdprController.js";

function makeController(access: string[]) {
  const controller = new GdprController();
  (controller as any).repos = { repos: true };
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action({ churchId: "c1", checkAccess: (perm: any) => access.includes(perm) });
  (controller as any).denyAccess = () => ({ status: 401 });
  return controller;
}

describe("GdprController.exportPerson", () => {
  beforeEach(() => exportPersonData.mockClear());

  it("denies a caller without people edit", async () => {
    const result = await (makeController([]) as any).exportPerson({ params: { personId: "p1" } }, {});
    expect(result).toEqual({ status: 401 });
    expect(exportPersonData).not.toHaveBeenCalled();
  });

  it("exports without confidential notes for a plain people-edit caller", async () => {
    await (makeController(["peopleEdit"]) as any).exportPerson({ params: { personId: "p1" } }, {});
    expect(exportPersonData).toHaveBeenCalledWith("c1", "p1", { repos: true }, { includeConfidentialNotes: false });
  });

  it("exports with confidential notes when the caller holds that permission", async () => {
    await (makeController(["peopleEdit", "peopleViewConfidentialNotes"]) as any).exportPerson({ params: { personId: "p1" } }, {});
    expect(exportPersonData).toHaveBeenCalledWith("c1", "p1", { repos: true }, { includeConfidentialNotes: true });
  });
});
