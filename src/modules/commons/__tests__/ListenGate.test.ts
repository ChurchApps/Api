import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
jest.mock("../helpers/CommonsMauticHelper.js", () => ({ CommonsMauticHelper: { tagUser: jest.fn(async () => {}), afterSave: jest.fn(async () => {}), afterSubmit: jest.fn(async () => {}), syncWriter: jest.fn(async () => {}) } }));
jest.mock("../controllers/CommonsBaseController", () => ({ CommonsBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../shared/helpers/index", () => ({
  Permissions: { server: { admin: { contentType: "Server", action: "Admin" } } },
  Environment: { worshipCommonsRoot: "http://localhost:3104" }
}));
const ROLES: Record<string, string> = { "score.musicxml": "score", "slides.json": "slides", "timing.json": "timing", "tune.abc": "abc" };
jest.mock("../helpers/index", () => ({
  ReviewerHelper: jest.requireActual("../helpers/ReviewerHelper").ReviewerHelper,
  CommonsMailHelper: {},
  DuplicateHelper: {},
  ContentLibraryHelper: {
    fileUrls: (asset: { id?: string }, files: AssetFile[]) => Object.fromEntries(files.map((f) => [ROLES[f.name] || f.name, `http://c/${asset.id}/${f.name}`])),
    liveKey: (asset: { id?: string }, name: string) => `commons/assets/song/${asset.id}/${name}`,
    fileKey: (asset: { id?: string }, _files: AssetFile[], name: string) => `commons/assets/song/${asset.id}/${name}`,
    readKey: jest.fn(async (): Promise<null> => null)
  },
  PublishHelper: {},
  QualityHelper: {},
  userNames: jest.fn(async () => ({}))
}));

import type express from "express";
import { CommonsAdminController } from "../controllers/CommonsAdminController.js";
import type { AssetFile, Song, SongView } from "../models/index.js";

// MySQL hands the hasChords tinyint back as 0/1, so the fixture carries a number where SongView says boolean.
type SongRow = Omit<SongView, "hasChords"> & { hasChords?: number };
type ListenReq = Parameters<CommonsAdminController["listen"]>[0];
type Row = Record<string, unknown>;

const FULL: AssetFile[] = [{ name: "score.musicxml" }, { name: "slides.json" }, { name: "lyrics.chordpro" }];

function listenController(overrides: Partial<SongRow> = {}, files: AssetFile[] = FULL, admin = true) {
  const song: SongRow = {
    id: "song0000001",
    title: "Amazing Grace",
    status: "published",
    license: "PD",
    language: "English",
    writer: "John Newton",
    songKey: "G",
    hasChords: 1,
    confidence: "score",
    scoreSource: "abc",
    publishedKeys: JSON.stringify(["G", "F"]),
    listenedKeys: null,
    sundayReadyBy: null,
    sundayReadyAt: null,
    rights: null,
    form: null,
    ...overrides
  };
  const repos = {
    song: {
      loadById: jest.fn(async () => song),
      update: jest.fn(async (_id: string, fields: Partial<Song>) => Object.assign(song, fields))
    },
    assetFile: { loadLive: jest.fn(async () => files) }
  };
  const au = { id: "admin000001", checkAccess: () => admin };
  const controller = new CommonsAdminController();
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (u: typeof au) => Promise<unknown>) => action(au),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  const listen = (keys: unknown) => {
    const req: Partial<ListenReq> = { params: { id: "song0000001" }, body: { keys }, headers: {} };
    return controller.listen(req as ListenReq, {} as express.Response);
  };
  return { listen, repos, song };
}

describe("POST /commons/admin/songs/:id/listen", () => {
  it("promotes to sunday-ready when the heard keys cover every published key of a package with score, chords and slides", async () => {
    const { listen, repos } = listenController();
    const detail = (await listen(["F", "G", "G "])) as Row;
    expect(repos.song.update).toHaveBeenCalledWith("song0000001", expect.objectContaining({ listenedKeys: JSON.stringify(["F", "G"]), sundayReadyBy: "admin000001", sundayReadyAt: expect.any(Date), confidence: "sunday-ready" }));
    expect(detail).toMatchObject({ id: "song0000001", confidence: "sunday-ready", sundayReady: true, listenedKeys: ["F", "G"], sundayReadyBy: "admin000001", hasScore: true, hasSlides: true, hasChords: true });
    expect(typeof detail.sundayReadyAt).toBe("string");
    expect(detail).toHaveProperty("rightsMatrix");
  });

  it("records a partial listen without promoting", async () => {
    const { listen, repos } = listenController();
    const detail = (await listen(["G"])) as Row;
    expect(repos.song.update).toHaveBeenCalledWith("song0000001", expect.objectContaining({ listenedKeys: JSON.stringify(["G"]), confidence: "score" }));
    expect(detail).toMatchObject({ sundayReady: false, listenedKeys: ["G"], sundayReadyBy: "admin000001" });
  });

  it("never promotes a package missing its score, slides or chords", async () => {
    const noSlides = listenController({}, [{ name: "score.musicxml" }]);
    expect(((await noSlides.listen(["G", "F"])) as Row).confidence).toBe("score");
    const noScore = listenController({ scoreSource: null }, [{ name: "slides.json" }]);
    expect(((await noScore.listen(["G", "F"])) as Row).confidence).toBe("chart-only");
    const noChords = listenController({ hasChords: 0 });
    expect(((await noChords.listen(["G", "F"])) as Row).confidence).toBe("score");
  });

  it("treats Open Hymnal ABC as a score when MusicXML was never registered", async () => {
    const abc = listenController({ scoreSource: "abc" }, [{ name: "tune.abc" }, { name: "slides.json" }, { name: "lyrics.chordpro" }]);
    expect(((await abc.listen(["G", "F"])) as Row).confidence).toBe("sunday-ready");
  });

  it("clears back to the computed tier on an empty list", async () => {
    const { listen, repos } = listenController({ confidence: "sunday-ready", listenedKeys: JSON.stringify(["G", "F"]), sundayReadyBy: "admin000001", sundayReadyAt: new Date() });
    const detail = (await listen([])) as Row;
    expect(repos.song.update).toHaveBeenCalledWith("song0000001", { listenedKeys: null, sundayReadyBy: null, sundayReadyAt: null, confidence: "score" });
    expect(detail).toMatchObject({ confidence: "score", sundayReady: false, listenedKeys: [], sundayReadyBy: null, sundayReadyAt: null });
  });

  it("falls back to the song key when nothing was published yet", async () => {
    const { listen } = listenController({ publishedKeys: null, songKey: "D" });
    expect(((await listen(["D"])) as Row).confidence).toBe("sunday-ready");
  });

  it("rejects bad bodies, non-reviewers and unknown songs", async () => {
    const { listen } = listenController();
    expect(((await listen("G")) as Row).status).toBe(400);
    expect(((await listen(["H"])) as Row).status).toBe(400);
    expect(((await listen(["G", "G#", "Bbm", "not a key"])) as Row).status).toBe(400);
    const visitor = listenController({}, FULL, false);
    expect(await visitor.listen(["G"])).toEqual({ obj: {}, status: 401 });
    const gone = listenController();
    gone.repos.song.loadById.mockResolvedValue(undefined);
    expect(await gone.listen(["G"])).toEqual({ obj: {}, status: 404 });
  });
});
