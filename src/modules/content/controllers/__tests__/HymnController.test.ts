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
    loadAll: jest.fn().mockResolvedValue([{ id: "hymn1" }]),
    loadPublic: jest.fn().mockResolvedValue({ id: "hymn1" }),
    loadPublicAll: jest.fn().mockResolvedValue([{ id: "hymn1" }]),
    save: jest.fn(),
    setPublished: jest.fn(),
    delete: jest.fn()
  };

  controller.json = jest.fn((body: any, statusCode: number) => ({ json: body, statusCode }));
  controller.auth = auth;
  controller.repos = { hymn: hymnRepo };
  controller.actionWrapperAnon = (_req: any, _res: any, action: () => Promise<any>) => action();

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

describe("HymnController private writes", () => {
  const validHymn = { number: 1, title: "Test hymn", language: "English", verses: [{ order: 1, text: "A verse" }] };

  it("save, publish, unpublish, and delete require content edit permission", async () => {
    const { controller, hymnRepo } = makeController(false);

    const results = [
      await controller.save({ body: [validHymn] } as any, {} as any),
      await controller.publish("hymn1", {} as any, {} as any),
      await controller.unpublish("hymn1", {} as any, {} as any),
      await controller.delete("hymn1", {} as any, {} as any)
    ];

    results.forEach((result) => expect(result).toEqual({ json: {}, statusCode: 401 }));
    expect(hymnRepo.save).not.toHaveBeenCalled();
    expect(hymnRepo.setPublished).not.toHaveBeenCalled();
    expect(hymnRepo.delete).not.toHaveBeenCalled();
    expect(hymnRepo.load).not.toHaveBeenCalled();
  });
});

describe("HymnController public routes", () => {
  it("getPublic loads a published hymn for the requested church without an access check", async () => {
    const { controller, auth, hymnRepo } = makeController(false);

    const result = await controller.getPublic("church2", "hymn1", {} as any, {} as any);

    expect(hymnRepo.loadPublic).toHaveBeenCalledWith("church2", "hymn1");
    expect(result).toEqual({ id: "hymn1" });
    expect(auth.checkAccess).not.toHaveBeenCalled();
  });

  it("loadPublicAll lists published hymns for the requested church without an access check", async () => {
    const { controller, auth, hymnRepo } = makeController(false);

    await controller.loadPublicAll("church2", {} as any, {} as any);

    expect(hymnRepo.loadPublicAll).toHaveBeenCalledWith("church2");
    expect(auth.checkAccess).not.toHaveBeenCalled();
  });
});
