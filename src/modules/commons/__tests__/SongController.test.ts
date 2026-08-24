import "reflect-metadata";
jest.mock("../controllers/CommonsBaseController", () => ({ CommonsBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../helpers/index", () => {
  const { demoOwnershipMissing, MAX_FILE_BYTES } = jest.requireActual("../helpers/SubmitValidation");
  return {
    demoOwnershipMissing,
    MAX_FILE_BYTES,
    ChordProHelper: { slug: (t: string) => t, toCho: () => "cho", toLyrics: () => "txt" },
    ContentLibraryHelper: {
      pendingFolderKey: (s: any) => `commons/pending/${s.id}`,
      storePending: jest.fn(async () => {}),
      withUrls: (v: any) => v
    },
    QualityHelper: { score: jest.fn(async () => ({})) },
    recordAssetDownload: jest.fn(async () => 7)
  };
});

import { CommonsSongController } from "../controllers/CommonsSongController.js";
import { ContentLibraryHelper } from "../helpers/index.js";

function songController() {
  const repos: any = {
    asset: {
      create: jest.fn(async (a: any) => { a.id = "song0000001"; return a; }),
      update: jest.fn(async () => {}),
      loadApproved: jest.fn(async () => ({ id: "song0000001", assetType: "song", status: "approved" })),
      setLike: jest.fn(async () => ({ liked: true, likeCount: 3 }))
    },
    song: {
      create: jest.fn(async (s: any) => s),
      update: jest.fn(async () => {})
    },
    author: { findOrCreate: jest.fn(async () => "author00001") }
  };
  const au = { id: "user0000001", churchId: "church00001", checkAccess: () => false };
  const controller = new CommonsSongController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

const body = (overrides: any = {}) => ({ title: "New Hymn", themes: "Grace", chordPro: "Verse 1\n[G]Sing", certified: true, license: "PD", ...overrides });

describe("SongController.submit", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates an asset and its song satellite sharing one id", async () => {
    const { controller, repos } = songController();
    const result: any = await controller.submit({ body: body() } as any, {} as any);

    expect(repos.asset.create).toHaveBeenCalled();
    const asset = repos.asset.create.mock.calls[0][0];
    expect(asset.assetType).toBe("song");
    expect(asset.name).toBe("New Hymn");
    expect(asset.tags).toBe("Grace");
    expect(asset.license).toBe("PD");
    expect(asset.status).toBe("pending");
    expect(asset.publisherUserId).toBe("user0000001");

    expect(repos.song.create).toHaveBeenCalled();
    const song = repos.song.create.mock.calls[0][0];
    expect(song.assetId).toBe("song0000001");
    expect(song.chordPro).toBe("Verse 1\n[G]Sing");
    expect(song.title).toBeUndefined();
    expect(song.authorId).toBeUndefined();
    expect(repos.author.findOrCreate).not.toHaveBeenCalled();

    expect(result.id).toBe("song0000001");
    expect(result.title).toBe("New Hymn");
    expect(result.churchCount).toBeUndefined();
    expect(result.path).toBe("commons/pending/song0000001");
  });

  it("resolves the writer to an author row", async () => {
    const { controller, repos } = songController();
    const result: any = await controller.submit({ body: body({ writer: " Fanny Crosby " }) } as any, {} as any);
    expect(repos.author.findOrCreate).toHaveBeenCalledWith("Fanny Crosby");
    expect(repos.song.create.mock.calls[0][0].authorId).toBe("author00001");
    expect(result.writer).toBe("Fanny Crosby");
  });

  it("stores uploads under conventional file names and records them on the asset", async () => {
    const { controller, repos } = songController();
    const demo = { name: "My Demo Track.WAV", contentType: "audio/wav", base64: Buffer.from("RIFF").toString("base64") };
    const result: any = await controller.submit({ body: body({ files: { demoAudio: demo }, recordingOwned: true, demoOwned: true }) } as any, {} as any);

    expect(ContentLibraryHelper.storePending).toHaveBeenCalledWith("commons/pending/song0000001/demoAudio.wav", "audio/wav", expect.any(Buffer));
    expect(repos.asset.update).toHaveBeenCalledWith("song0000001", { path: "commons/pending/song0000001", files: "demoAudio.wav" });
    expect(result.files).toBe("demoAudio.wav");
    expect(result.demoAudioUrl).toBeUndefined();
    expect(result.demoAudioBytes).toBeUndefined();
  });

  it("refuses a submission with no title", async () => {
    const { controller, repos } = songController();
    const result: any = await controller.submit({ body: body({ title: undefined }) } as any, {} as any);
    expect(result.status).toBe(400);
    expect(repos.asset.create).not.toHaveBeenCalled();
    expect(repos.song.create).not.toHaveBeenCalled();
  });
});

describe("SongController library", () => {
  it("saves a song by liking its asset", async () => {
    const { controller, repos } = songController();
    const result: any = await controller.addToLibrary({ params: { id: "song0000001" } } as any, {} as any);
    expect(repos.asset.setLike).toHaveBeenCalledWith("song0000001", "user0000001", true);
    expect(result).toEqual({ inLibrary: true, likeCount: 3 });
  });
});
