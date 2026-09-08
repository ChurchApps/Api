import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
jest.mock("../helpers/ContentLibraryHelper", () => ({
  ContentLibraryHelper: { songJson: jest.fn((view: any) => ({ id: view.id, status: view.status })), renderChordpro: () => "{title: x}\n" }
}));

import { packageFields, songPublishHook } from "../helpers/publishHooks/song";
import { ContentLibraryHelper } from "../helpers/ContentLibraryHelper";

const CHART = "Verse 1\n[G]Amazing grace! how [C]sweet the sound\n\nChorus\nPraise God";
const LYRICS = "Verse 1\nAmazing grace! how sweet the sound";
const parse = (v: any) => (typeof v === "string" ? JSON.parse(v) : v);

describe("packageFields", () => {
  it("derives the chart-only tier, first line, rights, form and keys for a first publish", () => {
    const f = packageFields({ chordPro: CHART, songKey: "G" }, undefined, "WC", "Ada Writer", ["demoAudio.mp3", "lyrics.chordpro"], ["demoAudio.mp3"]);
    expect(f).toMatchObject({ confidence: "chart-only", firstLine: "Amazing grace! how sweet the sound", hasChords: true, scoreSource: null });
    expect(parse(f.rights)).toEqual({
      text: { license: "WC", holder: "Ada Writer" }, translation: null, tune: { license: "WC", holder: "Ada Writer" }, arrangement: { license: "WC", holder: "Ada Writer" },
      recording: { license: "WC", holder: "Ada Writer" }, artwork: null
    });
    expect(parse(f.form)).toEqual({ status: "draft", sections: [{ label: "Verse 1", lyric: 1 }, { label: "Chorus", lyric: 2 }], defaultOrder: ["Verse 1", "Chorus"] });
    expect(parse(f.publishedKeys)).toEqual(["G"]);
    expect(f).not.toHaveProperty("listenedKeys");
  });

  it("is lyrics-only without chords, and artwork appears only with an art file", () => {
    const f = packageFields({ chordPro: LYRICS }, undefined, "PD", "", ["art.png"], []);
    expect(f).toMatchObject({ confidence: "lyrics-only", hasChords: false });
    expect(parse(f.rights)).toMatchObject({ artwork: { license: "PD" }, recording: null });
    expect(parse(f.rights).text).toEqual({ license: "PD" });
    expect(parse(f.publishedKeys)).toEqual([]);
  });

  it("an uploaded score is a proofread master; a seeded abc conversion keeps its source", () => {
    const uploaded = packageFields({ chordPro: CHART }, undefined, "WC", "W", ["score.musicxml", "tune.abc"], ["score.musicxml"]);
    expect(uploaded).toMatchObject({ confidence: "proofread-score", scoreSource: "master" });
    const seeded = packageFields({ chordPro: CHART }, { chordPro: CHART, scoreSource: "abc", confidence: "converted-from-abc" }, "PD", "W", ["score.musicxml", "tune.abc"], []);
    expect(seeded).toMatchObject({ confidence: "converted-from-abc", scoreSource: "abc" });
  });

  it("keeps sunday-ready, the listen record, an approved form and a key pin when neither lyrics nor score files changed", () => {
    const existing = { chordPro: CHART, confidence: "sunday-ready", scoreSource: "abc", listenedKeys: '["G","F"]', publishedKeys: '["G","F"]', form: '{"status":"approved","sections":[{"label":"Verse 1","lyric":1}],"defaultOrder":["Verse 1"]}', rights: '{"text":{"license":"PD","basis":"published 1779","holder":"John Newton"},"tune":null}' };
    const f = packageFields({ chordPro: CHART, songKey: "G", bpm: 90 }, existing, "PD", "John Newton", ["score.musicxml", "demoAudio.mp3"], ["demoAudio.mp3"]);
    expect(f.confidence).toBe("sunday-ready");
    expect(f).not.toHaveProperty("listenedKeys");
    expect(parse(f.form).status).toBe("approved");
    expect(parse(f.publishedKeys)).toEqual(["G", "F"]);
    expect(parse(f.rights).text).toEqual({ license: "PD", basis: "published 1779", holder: "John Newton" });
  });

  it("drops sunday-ready and clears the listen record when the lyrics change or a score file changes", () => {
    const existing = { chordPro: CHART, confidence: "sunday-ready", scoreSource: "abc", form: '{"status":"approved","sections":[],"defaultOrder":[]}' };
    const lyrics = packageFields({ chordPro: CHART + "\nmore" }, existing, "PD", "W", ["score.musicxml"], []);
    expect(lyrics).toMatchObject({ confidence: "converted-from-abc", listenedKeys: null, sundayReadyBy: null, sundayReadyAt: null });
    expect(parse(lyrics.form).status).toBe("draft");
    const score = packageFields({}, existing, "PD", "W", ["score.musicxml", "tune.abc"], ["tune.abc"]);
    expect(score).toMatchObject({ confidence: "converted-from-abc", listenedKeys: null });
    expect(parse(score.form).status).toBe("approved");
  });

  it("a layer whose license changed is rewritten from the asset license", () => {
    const f = packageFields({ chordPro: CHART }, { chordPro: CHART, rights: '{"text":{"license":"PD","basis":"old"}}' }, "CC-BY", "W", [], []);
    expect(parse(f.rights).text).toEqual({ license: "CC-BY", holder: "W" });
  });
});

describe("songPublishHook.onPublish", () => {
  it("upserts the package columns and writes song.json from the asset status, never a literal", async () => {
    const repos: any = {
      song: { loadSatellite: jest.fn(async () => undefined), upsert: jest.fn(async () => {}), loadById: jest.fn(async () => ({ id: "asset000001", status: "unpublished", title: "T" })) },
      author: { findOrCreate: jest.fn(async () => "author00001"), loadById: jest.fn(async () => ({ id: "author00001" })), update: jest.fn(async () => {}) }
    };
    const written: Record<string, string> = {};
    await songPublishHook.onPublish({
      asset: { id: "asset000001", assetType: "song", license: "WC", status: "unpublished" },
      submission: { id: "sub00000001", submittedBy: "user0000001", payload: {} },
      detail: { writer: "Ada", chordPro: CHART, songKey: "G" },
      files: [{ name: "demoAudio.mp3" }],
      filesChanged: [{ name: "demoAudio.mp3", action: "add" }],
      version: 1,
      repos,
      writeFile: async (name, _ct, body) => { written[name] = body.toString(); }
    });
    expect(repos.song.upsert).toHaveBeenCalledWith(expect.objectContaining({ assetId: "asset000001", confidence: "chart-only", firstLine: "Amazing grace! how sweet the sound", hasChords: true, publishedKeys: '["G"]' }));
    expect(parse(repos.song.upsert.mock.calls[0][0].rights).recording).toEqual({ license: "WC", holder: "Ada" });
    expect(ContentLibraryHelper.songJson).toHaveBeenCalledWith(expect.objectContaining({ status: "unpublished" }), expect.anything());
    expect(JSON.parse(written["song.json"])).toEqual({ id: "asset000001", status: "unpublished" });
  });
});
