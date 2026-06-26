import "reflect-metadata";
jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../PraiseChartsHelper.js", () => ({ PraiseChartsHelper: { findBestMatch: jest.fn(), loadRaw: jest.fn(), appendDetails: jest.fn(), load: jest.fn() } }));

import { SongHelper } from "../SongHelper.js";
import { RepoManager } from "../../../../shared/infrastructure/index.js";
import { PraiseChartsHelper } from "../PraiseChartsHelper.js";

// Exercises the FreeShow import path (POST /content/songs/import -> importSong).
// Guards the PC-alignment changes: a Song must be created carrying songDetailId,
// and a CCLI/freeShow match must return an Arrangement (not a SongDetail).
describe("SongHelper.importSong (FreeShow import)", () => {
  let repos: any;

  beforeEach(() => {
    repos = {
      arrangement: {
        loadByFreeShowId: jest.fn().mockResolvedValue(null),
        loadBySongDetailId: jest.fn().mockResolvedValue([]),
        save: jest.fn(async (a: any) => ({ ...a, id: "arr_new" }))
      },
      songDetailLink: {
        loadByServiceAndKey: jest.fn().mockResolvedValue(null),
        loadForSongDetail: jest.fn().mockResolvedValue([]),
        save: jest.fn()
      },
      songDetail: {
        loadGlobal: jest.fn(),
        loadByPraiseChartsId: jest.fn(),
        save: jest.fn(async (sd: any) => ({ ...sd, id: "sd_new" }))
      },
      song: { save: jest.fn(async (s: any) => ({ ...s, id: "song_new" })) },
      arrangementKey: { save: jest.fn() }
    };
    (RepoManager.getRepos as jest.Mock).mockResolvedValue(repos);
    (PraiseChartsHelper.findBestMatch as jest.Mock).mockReset();
  });

  afterEach(() => jest.clearAllMocks());

  it("reuses an existing arrangement matched by freeShowId without creating anything", async () => {
    repos.arrangement.loadByFreeShowId.mockResolvedValue({ id: "arr_existing", songId: "s1", freeShowId: "fs1" });
    const result = await SongHelper.importSong("c1", { freeShowId: "fs1", title: "T" });
    expect(result).toMatchObject({ id: "arr_existing" });
    expect(repos.song.save).not.toHaveBeenCalled();
    expect(repos.arrangement.save).not.toHaveBeenCalled();
  });

  it("returns the Arrangement (not the SongDetail) when matched by CCLI number", async () => {
    repos.songDetailLink.loadByServiceAndKey.mockResolvedValue({ songDetailId: "sd1" });
    repos.songDetail.loadGlobal.mockResolvedValue({ id: "sd1", title: "Amazing Grace", artist: "Newton" });
    repos.arrangement.loadBySongDetailId.mockResolvedValue([{ id: "arr1", songId: "s1", songDetailId: "sd1", name: "Default" }]);
    const result: any = await SongHelper.importSong("c1", { freeShowId: "fs2", ccliNumber: "12345", title: "Amazing Grace" });
    expect(result).toMatchObject({ id: "arr1", songId: "s1" });
    expect(result.title).toBeUndefined(); // a leaked SongDetail would carry title (the old bug)
    expect(repos.song.save).not.toHaveBeenCalled();
  });

  it("creates a Song carrying songDetailId when PraiseCharts matches", async () => {
    (PraiseChartsHelper.findBestMatch as jest.Mock).mockResolvedValue({ praiseChartsId: "pc1", title: "New Song", keySignature: "G" });
    repos.songDetail.loadByPraiseChartsId.mockResolvedValue({ id: "sd9", praiseChartsId: "pc1", title: "New Song", keySignature: "G" });
    const result = await SongHelper.importSong("c1", { freeShowId: "fs3", title: "New Song" });
    expect(repos.song.save).toHaveBeenCalledTimes(1);
    expect(repos.song.save.mock.calls[0][0]).toMatchObject({ songDetailId: "sd9" });
    expect(repos.arrangement.save.mock.calls[0][0]).toMatchObject({ songId: "song_new", freeShowId: "fs3" });
    expect(result).toMatchObject({ id: "arr_new" });
  });

  it("falls back to a custom song (with songDetailId + lyrics + freeShowId) when PraiseCharts finds nothing", async () => {
    (PraiseChartsHelper.findBestMatch as jest.Mock).mockResolvedValue(null);
    const result = await SongHelper.importSong("c1", { freeShowId: "fs4", title: "Indie", artist: "Local", lyrics: "la la" });
    expect(repos.songDetail.save).toHaveBeenCalledTimes(1);
    expect(repos.song.save.mock.calls[0][0]).toMatchObject({ songDetailId: "sd_new" });
    expect(repos.arrangement.save.mock.calls[0][0]).toMatchObject({ freeShowId: "fs4", lyrics: "la la" });
    expect(result).toMatchObject({ id: "arr_new" });
  });
});
