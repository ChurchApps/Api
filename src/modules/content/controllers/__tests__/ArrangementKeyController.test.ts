import "reflect-metadata";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/index", () => ({ Permissions: { content: { edit: "contentEdit" } } }));

import { ArrangementKeyController } from "../ArrangementKeyController.js";

function makeController(opts: any = {}) {
  const repos = {
    arrangementKey: { load: jest.fn(async () => opts.key ?? null) },
    arrangement: { load: jest.fn(async () => opts.arrangement ?? null) },
    song: { load: jest.fn(async () => ({ id: "s1" })) },
    songDetail: { loadGlobal: jest.fn(async () => ({ id: "sd1" })) }
  };
  const controller = new ArrangementKeyController();
  (controller as any).repos = repos;
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

describe("ArrangementKeyController.getForPresenter", () => {
  it("returns 404 when the arrangement key does not exist", async () => {
    const { controller, repos } = makeController();
    const result: any = await (controller as any).getForPresenter("c1", "missing", {}, {});
    expect(result).toEqual({ obj: {}, status: 404 });
    expect(repos.arrangement.load).not.toHaveBeenCalled();
  });

  it("returns 404 when the key's arrangement was deleted", async () => {
    const { controller, repos } = makeController({ key: { id: "k1", arrangementId: "a1" } });
    const result: any = await (controller as any).getForPresenter("c1", "k1", {}, {});
    expect(result).toEqual({ obj: {}, status: 404 });
    expect(repos.song.load).not.toHaveBeenCalled();
  });

  it("returns the key with its arrangement, song and song detail", async () => {
    const { controller } = makeController({ key: { id: "k1", arrangementId: "a1" }, arrangement: { id: "a1", songId: "s1", songDetailId: "sd1" } });
    const result: any = await (controller as any).getForPresenter("c1", "k1", {}, {});
    expect(result).toEqual({ arrangementKey: { id: "k1", arrangementId: "a1" }, arrangement: { id: "a1", songId: "s1", songDetailId: "sd1" }, song: { id: "s1" }, songDetail: { id: "sd1" } });
  });
});
