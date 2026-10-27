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

function makeController() {
  const controller = Object.create(HymnController.prototype) as any;
  controller.auth = { churchId: "church1", checkAccess: jest.fn(() => true) };
  controller.json = jest.fn((body: any, statusCode: number) => ({ json: body, statusCode }));
  controller.repos = { hymn: { save: jest.fn(async (hymn: any) => hymn) } };
  controller.actionWrapper = (_req: any, _res: any, action: (au: any) => Promise<any>) => action(controller.auth);
  return controller;
}

const validHymn = { number: 1, title: "Test hymn", language: "English", verses: [{ order: 1, text: "A verse" }] };

describe("HymnController.save", () => {
  it("rejects a non-array or empty body without writing", async () => {
    const controller = makeController();

    const nonArray = await controller.save({ body: validHymn } as any, {} as any);
    const empty = await controller.save({ body: [] } as any, {} as any);

    expect(nonArray).toEqual({ json: { errors: ["At least one hymn is required."] }, statusCode: 400 });
    expect(empty).toEqual({ json: { errors: ["At least one hymn is required."] }, statusCode: 400 });
    expect(controller.repos.hymn.save).not.toHaveBeenCalled();
  });

  it("rejects missing required fields before writing", async () => {
    const controller = makeController();

    const result = await controller.save({ body: [{ ...validHymn, title: "", verses: [{ order: 1, text: " " }] }] } as any, {} as any);

    expect(result).toEqual({ json: { errors: ["Hymn 1 needs a title.", "Hymn 1 needs at least one verse with text."] }, statusCode: 400 });
    expect(controller.repos.hymn.save).not.toHaveBeenCalled();
  });

  it("rejects invalid hymn numbers and unsupported languages", async () => {
    const controller = makeController();

    const result = await controller.save({ body: [{ ...validHymn, number: 1.5, language: "French" }] } as any, {} as any);

    expect(result).toEqual({ json: { errors: ["Hymn 1 needs a whole number greater than zero.", "Hymn 1 needs a supported language."] }, statusCode: 400 });
    expect(controller.repos.hymn.save).not.toHaveBeenCalled();
  });

  it("saves valid hymns to the authenticated church regardless of payload churchId", async () => {
    const controller = makeController();

    await controller.save({ body: [{ ...validHymn, churchId: "anotherChurch" }] } as any, {} as any);

    expect(controller.repos.hymn.save).toHaveBeenCalledWith({ ...validHymn, churchId: "church1" });
  });
});
