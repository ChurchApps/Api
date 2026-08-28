import "reflect-metadata";
jest.mock("../controllers/CommonsBaseController", () => ({ CommonsBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../helpers/index", () => ({ ipHash: jest.fn(() => "ip-unique") }));

import { CommonsReportController } from "../controllers/CommonsReportController.js";
import { ipHash } from "../helpers/index.js";

function reportController(signedIn = true) {
  const repos: any = {
    report: { create: jest.fn(async (r: any) => ({ ...r, id: "rep00000001" })) },
    asset: { loadById: jest.fn(async (id: string) => ({ id, name: "Old Hymn" })) }
  };
  const au = signedIn
    ? { id: "user0000001", email: "writer@example.com", firstName: "Ada", lastName: "Crosby", checkAccess: () => false }
    : { checkAccess: () => false };
  const controller = new CommonsReportController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

describe("CommonsReportController.create", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ipHash as jest.Mock).mockReturnValue(`ip-${Math.random()}`);
  });

  it("lets a signed-in writer request removal with assetId and details only", async () => {
    const { controller, repos } = reportController();
    const result: any = await controller.create({ body: { reporterRole: "writer", assetId: "asset000001", details: "please take this down", reason: "copyright" } } as any, {} as any);
    expect(result).toEqual({ id: "rep00000001" });
    expect(repos.report.create).toHaveBeenCalledWith(expect.objectContaining({
      assetId: "asset000001",
      details: "please take this down",
      reason: "copyright",
      reporterRole: "writer",
      reporterUserId: "user0000001",
      name: "Ada Crosby",
      email: "writer@example.com",
      contentText: "Old Hymn"
    }));
  });

  it("accepts reason=other for a writer request and still rate-limits", async () => {
    (ipHash as jest.Mock).mockReturnValue("ip-same");
    const { controller, repos } = reportController();
    await controller.create({ body: { reporterRole: "writer", assetId: "asset000001", details: "x", reason: "other" } } as any, {} as any);
    expect(repos.report.create).toHaveBeenCalledWith(expect.objectContaining({ reason: "other" }));
    await controller.create({ body: { reporterRole: "writer", assetId: "asset000001", details: "y", reason: "other" } } as any, {} as any);
    await controller.create({ body: { reporterRole: "writer", assetId: "asset000001", details: "z", reason: "other" } } as any, {} as any);
    const limited: any = await controller.create({ body: { reporterRole: "writer", assetId: "asset000001", details: "nope", reason: "other" } } as any, {} as any);
    expect(limited.status).toBe(429);
  });

  it("still requires name, email and signature for anonymous copyright reports", async () => {
    const { controller, repos } = reportController(false);
    const result: any = await controller.create({ body: { contentText: "Hymn", details: "stolen", reason: "copyright" } } as any, {} as any);
    expect(result.status).toBe(400);
    expect(repos.report.create).not.toHaveBeenCalled();
  });
});
