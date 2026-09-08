import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
jest.mock("../controllers/CommonsBaseController", () => ({ CommonsBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../../../shared/helpers/index", () => ({
  Permissions: { server: { admin: { contentType: "Server", action: "Admin" } } },
  Environment: { worshipCommonsRoot: "http://localhost:3104" }
}));
const ROLES: Record<string, string> = { "score.musicxml": "score", "slides.json": "slides", "timing.json": "timing" };
jest.mock("../helpers/index", () => ({
  ReviewerHelper: jest.requireActual("../helpers/ReviewerHelper").ReviewerHelper,
  CommonsMailHelper: {},
  DuplicateHelper: {},
  ContentLibraryHelper: {
    fileUrls: (asset: any, files: any[]) => Object.fromEntries(files.map((f) => [ROLES[f.name] || f.name, `http://c/${asset.id}/${f.name}`])),
    liveKey: (asset: any, name: string) => `commons/assets/song/${asset.id}/${name}`,
    fileKey: (asset: any, _files: any[], name: string) => `commons/assets/song/${asset.id}/${name}`,
    readKey: jest.fn(async () => null)
  },
  PublishHelper: {},
  QualityHelper: {},
  userNames: jest.fn(async () => ({}))
}));

import { CommonsAdminController } from "../controllers/CommonsAdminController.js";

const FULL = [{ name: "score.musicxml" }, { name: "slides.json" }, { name: "lyrics.chordpro" }];

function listenController(overrides: Partial<any> = {}, files: any[] = FULL, admin = true) {
  const song: any = {
    id: "song0000001",
    title: "Amazing Grace",
    status: "published",
    license: "PD",
    language: "English",
    writer: "John Newton",
    songKey: "G",
    hasChords: 1,
    confidence: "converted-from-abc",
    scoreSource: "abc",
    publishedKeys: JSON.stringify(["G", "F"]),
    listenedKeys: null,
    sundayReadyBy: null,
    sundayReadyAt: null,
    rights: null,
    form: null,
    ...overrides
  };
  const repos: any = {
    song: {
      loadById: jest.fn(async () => song),
      update: jest.fn(async (_id: string, fields: any) => Object.assign(song, fields))
    },
    assetFile: { loadLive: jest.fn(async () => files) }
  };
  const au = { id: "admin000001", checkAccess: () => admin };
  const controller = new CommonsAdminController();
  (controller as any).repos = repos;
  (controller as any).actionWrapper = (_req: any, _res: any, action: any) => action(au);
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  const listen = (keys: unknown) => controller.listen({ params: { id: "song0000001" }, body: { keys }, headers: {} } as any, {} as any);
  return { listen, repos, song };
}

describe("POST /commons/admin/songs/:id/listen", () => {
  it("promotes to sunday-ready when the heard keys cover every published key of a package with score, chords and slides", async () => {
    const { listen, repos } = listenController();
    const detail: any = await listen(["F", "G", "G "]);
    expect(repos.song.update).toHaveBeenCalledWith("song0000001", expect.objectContaining({ listenedKeys: JSON.stringify(["F", "G"]), sundayReadyBy: "admin000001", sundayReadyAt: expect.any(Date), confidence: "sunday-ready" }));
    expect(detail).toMatchObject({ id: "song0000001", confidence: "sunday-ready", sundayReady: true, listenedKeys: ["F", "G"], sundayReadyBy: "admin000001", hasScore: true, hasSlides: true, hasChords: true });
    expect(typeof detail.sundayReadyAt).toBe("string");
    expect(detail).toHaveProperty("rightsMatrix");
  });

  it("records a partial listen without promoting", async () => {
    const { listen, repos } = listenController();
    const detail: any = await listen(["G"]);
    expect(repos.song.update).toHaveBeenCalledWith("song0000001", expect.objectContaining({ listenedKeys: JSON.stringify(["G"]), confidence: "converted-from-abc" }));
    expect(detail).toMatchObject({ sundayReady: false, listenedKeys: ["G"], sundayReadyBy: "admin000001" });
  });

  it("never promotes a package missing its score, slides or chords", async () => {
    const noSlides = listenController({}, [{ name: "score.musicxml" }]);
    expect(((await noSlides.listen(["G", "F"])) as any).confidence).toBe("converted-from-abc");
    const noScore = listenController({ scoreSource: null }, [{ name: "slides.json" }]);
    expect(((await noScore.listen(["G", "F"])) as any).confidence).toBe("chart-only");
    const noChords = listenController({ hasChords: 0 });
    expect(((await noChords.listen(["G", "F"])) as any).confidence).toBe("converted-from-abc");
  });

  it("clears back to the computed tier on an empty list", async () => {
    const { listen, repos } = listenController({ confidence: "sunday-ready", listenedKeys: JSON.stringify(["G", "F"]), sundayReadyBy: "admin000001", sundayReadyAt: new Date() });
    const detail: any = await listen([]);
    expect(repos.song.update).toHaveBeenCalledWith("song0000001", { listenedKeys: null, sundayReadyBy: null, sundayReadyAt: null, confidence: "converted-from-abc" });
    expect(detail).toMatchObject({ confidence: "converted-from-abc", sundayReady: false, listenedKeys: [], sundayReadyBy: null, sundayReadyAt: null });
  });

  it("falls back to the song key when nothing was published yet", async () => {
    const { listen } = listenController({ publishedKeys: null, songKey: "D" });
    expect(((await listen(["D"])) as any).confidence).toBe("sunday-ready");
  });

  it("rejects bad bodies, non-reviewers and unknown songs", async () => {
    const { listen } = listenController();
    expect(((await listen("G")) as any).status).toBe(400);
    expect(((await listen(["H"])) as any).status).toBe(400);
    expect(((await listen(["G", "G#", "Bbm", "not a key"])) as any).status).toBe(400);
    const visitor = listenController({}, FULL, false);
    expect(await visitor.listen(["G"])).toEqual({ obj: {}, status: 401 });
    const gone = listenController();
    gone.repos.song.loadById.mockResolvedValue(undefined);
    expect(await gone.listen(["G"])).toEqual({ obj: {}, status: 404 });
  });
});
