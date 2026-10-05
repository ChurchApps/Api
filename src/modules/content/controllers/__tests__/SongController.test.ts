import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { content: { edit: "contentEdit" } } }));
jest.mock("../../helpers/SongHelper", () => ({ SongHelper: { importSongs: jest.fn() } }));

import { SongController } from "../SongController.js";

function setup() {
  const repos = { song: { save: jest.fn(async (s: any) => ({ ...s, id: "s1" })) } };
  const au = { churchId: "c1", checkAccess: () => true };
  const controller: any = new SongController();
  controller.repos = repos;
  controller.actionWrapper = (_req: any, _res: any, action: any) => action(au);
  controller.json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

describe("SongController POST / body shape (#1196)", () => {
  it("accepts a single song object", async () => {
    const { controller } = setup();
    const result = await controller.post({ body: { songDetailId: "sd1", name: "Amazing Grace" } }, {});
    expect(result).toEqual([{ id: "s1", churchId: "c1", songDetailId: "sd1", name: "Amazing Grace" }]);
  });

  it("still accepts an array", async () => {
    const { controller } = setup();
    const result = await controller.post({ body: [{ songDetailId: "sd1", name: "A" }, { songDetailId: "sd2", name: "B" }] }, {});
    expect(result).toHaveLength(2);
  });

  it("returns 400 pointing at /content/songs/import for a new song with no songDetailId", async () => {
    const { controller, repos } = setup();
    const result = await controller.post({ body: { title: "Amazing Grace", author: "John Newton", ccliNumber: "22025" } }, {});
    expect(result.status).toBe(400);
    expect(result.obj.error).toContain("/content/songs/import");
    expect(repos.song.save).not.toHaveBeenCalled();
  });
});
