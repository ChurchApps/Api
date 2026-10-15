// Issue #1137: importSong returned the church's existing arrangement on a CCLI or
// PraiseCharts match without recording the new show's freeShowId, so B1 showed one
// song per match and /freeShow/missing re-sent the rest on every sync.
jest.mock("../PraiseChartsHelper.js", () => ({ PraiseChartsHelper: { findBestMatch: jest.fn(async () => null) } }));
const getRepos = jest.fn();
jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: (...args: unknown[]) => getRepos(...args) } }));

import { SongHelper } from "../SongHelper.js";

describe("SongHelper.importSong on an existing match", () => {
  const existing = { id: "arr-1", churchId: "CHURCH1", songId: "song-1", songDetailId: "sd-1", name: "Default", freeShowId: "fs-1" };
  const saveArrangement = jest.fn(async (a: any) => ({ ...a, id: a.id || "arr-2" }));
  const saveKey = jest.fn(async (k: any) => k);

  beforeEach(() => {
    saveArrangement.mockClear();
    saveKey.mockClear();
    getRepos.mockResolvedValue({
      arrangement: {
        loadByFreeShowId: jest.fn(async () => null),
        loadBySongDetailId: jest.fn(async () => [{ ...existing }]),
        save: saveArrangement
      },
      arrangementKey: { save: saveKey },
      songDetailLink: { loadByServiceAndKey: jest.fn(async () => ({ songDetailId: "sd-1" })) },
      songDetail: { loadGlobal: jest.fn(async () => ({ id: "sd-1", title: "Amazing Grace" })) }
    });
  });

  it("adds a second arrangement for a different show of the same CCLI song", async () => {
    const result = await SongHelper.importSong("CHURCH1", { freeShowId: "fs-2", title: "Amazing Grace (slow)", ccliNumber: "22025", lyrics: "[Verse]\nAmazing grace" });

    expect(saveArrangement).toHaveBeenCalledTimes(1);
    expect(saveArrangement.mock.calls[0][0]).toMatchObject({ songId: "song-1", songDetailId: "sd-1", freeShowId: "fs-2", name: "Amazing Grace (slow)" });
    expect(saveKey).toHaveBeenCalledWith(expect.objectContaining({ arrangementId: "arr-2" }));
    expect(result.freeShowId).toBe("fs-2");
  });

  it("returns the existing arrangement untouched when it already carries this show", async () => {
    const result = await SongHelper.importSong("CHURCH1", { freeShowId: "fs-1", title: "Amazing Grace", ccliNumber: "22025" });

    expect(saveArrangement).not.toHaveBeenCalled();
    expect(result.id).toBe("arr-1");
  });
});
