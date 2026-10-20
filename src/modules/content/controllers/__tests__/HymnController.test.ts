import "reflect-metadata";
jest.mock("../ContentBaseController.js", () => ({
  ContentBaseController: class {
    public auth: any;
    public repos: any;
    actionWrapper(_req: any, _res: any, action: (au: any) => Promise<any>) { return action(this.auth); }
    json(body: any, statusCode: number) { return { json: body, statusCode }; }
  }
}));
jest.mock("../../helpers/index.js", () => ({ Permissions: { content: { edit: "content.edit" } } }));
jest.mock("../../models/index.js", () => ({ Hymn: class Hymn {} }));

import { HymnController } from "../HymnController";

function makeController(canEdit: boolean) {
  const controller = Object.create(HymnController.prototype) as any;
  const auth = { churchId: "church1", checkAccess: jest.fn(() => canEdit) };
  const hymnRepo = {
    load: jest.fn().mockResolvedValue({ id: "hymn1" }),
    loadAll: jest.fn().mockResolvedValue([{ id: "hymn1" }])
  };

  controller.json = jest.fn((body: any, statusCode: number) => ({ json: body, statusCode }));
  controller.auth = auth;
  controller.repos = { hymn: hymnRepo };

  return { controller, auth, hymnRepo };
}

describe("HymnController private routes", () => {
  it("requires content edit permission to list drafts and archived hymns", async () => {
    const { controller, auth, hymnRepo } = makeController(false);
    const result = await controller.loadAll({} as any, {} as any);

    expect(auth.checkAccess).toHaveBeenCalledWith("content.edit");
    expect(controller.json).toHaveBeenCalledWith({}, 401);
    expect(hymnRepo.loadAll).not.toHaveBeenCalled();
    expect(result).toEqual({ json: {}, statusCode: 401 });
  });

  it("requires content edit permission to load a private hymn by id", async () => {
    const { controller, auth, hymnRepo } = makeController(false);
    const result = await controller.get("hymn1", {} as any, {} as any);

    expect(auth.checkAccess).toHaveBeenCalledWith("content.edit");
    expect(controller.json).toHaveBeenCalledWith({}, 401);
    expect(hymnRepo.load).not.toHaveBeenCalled();
    expect(result).toEqual({ json: {}, statusCode: 401 });
  });

  it("loads church-scoped hymns for a content editor", async () => {
    const { controller, hymnRepo } = makeController(true);

    await controller.loadAll({} as any, {} as any);
    await controller.get("hymn1", {} as any, {} as any);

    expect(hymnRepo.loadAll).toHaveBeenCalledWith("church1");
    expect(hymnRepo.load).toHaveBeenCalledWith("church1", "hymn1");
  });
});
