import "reflect-metadata";
jest.mock("../../membership/helpers/MauticHelper.js", () => ({ MauticHelper: { createAndTag: jest.fn(async () => {}), createAndUpdate: jest.fn(async () => {}) } }));
jest.mock("../helpers/CommonsMailHelper.js", () => ({ CommonsMailHelper: { notifyWriterFlag: jest.fn(async () => {}) } }));
jest.mock("../../../shared/infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: jest.fn(async () => ({ user: { loadByIds: jest.fn(async (ids: string[]) => ids.map((id) => ({ id, email: `${id}@example.com`, firstName: "Wes", lastName: "Writer" }))) } })) } }));

import { CommonsMauticHelper, SAVE_BURST, UPLOAD_BURST } from "../helpers/CommonsMauticHelper.js";
import { MauticHelper } from "../../membership/helpers/MauticHelper.js";
import { CommonsMailHelper } from "../helpers/CommonsMailHelper.js";

function repos(opts: { songs?: number; saves?: number; recentSaves?: number; recentSongs?: number } = {}): any {
  return {
    asset: { countPublishedSongs: jest.fn(async () => opts.songs ?? 0), loadSongPublisherIds: jest.fn(async () => ["writer00001", "writer00002"]) },
    rating: { countSavesOfPublisher: jest.fn(async (_id: string, hours?: number) => (hours ? opts.recentSaves ?? 0 : opts.saves ?? 0)) },
    submission: { countNewSongsSubmittedSince: jest.fn(async () => opts.recentSongs ?? 0) }
  };
}
const song = { id: "asset000001", assetType: "song", publisherUserId: "writer00001" };

describe("CommonsMauticHelper writer milestones", () => {
  beforeEach(() => jest.clearAllMocks());

  it("pushes the writer's song and save counts onto their contact", async () => {
    await CommonsMauticHelper.syncWriter(repos({ songs: 12, saves: 57 }), "writer00001");
    expect(MauticHelper.createAndUpdate).toHaveBeenCalledWith("writer00001@example.com", "Wes", "Writer", { wc_songs_published: 12, wc_song_saves: 57 });
  });

  it("syncs the writer, not the saver, when someone saves their song", async () => {
    await CommonsMauticHelper.afterSave(repos({ saves: 3 }), song, "saver000001", true);
    expect(MauticHelper.createAndUpdate).toHaveBeenCalledWith("writer00001@example.com", "Wes", "Writer", expect.objectContaining({ wc_song_saves: 3 }));
  });

  it("ignores a writer saving their own song", async () => {
    await CommonsMauticHelper.afterSave(repos(), song, "writer00001", true);
    expect(MauticHelper.createAndUpdate).not.toHaveBeenCalled();
  });

  it("flags once, on the save that crosses the daily line", async () => {
    await CommonsMauticHelper.afterSave(repos({ recentSaves: SAVE_BURST }), song, "saver000001", true);
    expect(MauticHelper.createAndTag).toHaveBeenCalledWith("writer00001@example.com", "Wes", "Writer", "wc-flag-save-burst");
    expect(CommonsMailHelper.notifyWriterFlag).toHaveBeenCalledTimes(1);
    jest.clearAllMocks();
    await CommonsMauticHelper.afterSave(repos({ recentSaves: SAVE_BURST + 1 }), song, "saver000001", true);
    expect(CommonsMailHelper.notifyWriterFlag).not.toHaveBeenCalled();
  });

  it("does not flag on an unsave", async () => {
    await CommonsMauticHelper.afterSave(repos({ recentSaves: SAVE_BURST }), song, "saver000001", false);
    expect(CommonsMailHelper.notifyWriterFlag).not.toHaveBeenCalled();
  });

  it("flags an account that sends a day's worth of new songs", async () => {
    await CommonsMauticHelper.afterSubmit(repos({ recentSongs: UPLOAD_BURST - 1 }), "writer00001");
    expect(CommonsMailHelper.notifyWriterFlag).not.toHaveBeenCalled();
    await CommonsMauticHelper.afterSubmit(repos({ recentSongs: UPLOAD_BURST }), "writer00001");
    expect(MauticHelper.createAndTag).toHaveBeenCalledWith("writer00001@example.com", "Wes", "Writer", "wc-flag-upload-burst");
    expect(CommonsMailHelper.notifyWriterFlag).toHaveBeenCalledWith("writer00001@example.com", "Wes Writer", expect.stringContaining(`${UPLOAD_BURST} new songs`));
  });

  it("resyncs every song publisher nightly", async () => {
    expect(await CommonsMauticHelper.syncAllWriters(repos())).toEqual({ writers: 2 });
    expect(MauticHelper.createAndUpdate).toHaveBeenCalledTimes(2);
  });
});
