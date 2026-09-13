import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });

import { ASSET_TYPES } from "../__mocks__/churchappsHelpers";
import { isUploadableName, normalizeTags, resultingFileNames, validateSubmission } from "../helpers/SubmitValidation";

const song = ASSET_TYPES.song;
const freeshow = ASSET_TYPES["freeshow/template"];
const goodSong = { name: "Hymn", license: "WC", detail: { writer: "Anon", chordPro: "Verse 1\n[G]Sing", certified: true } };
const file = (name: string, sizeBytes = 1000, action = "add") => ({ name, sizeBytes, action });

describe("registry-driven submission validation", () => {
  it("accepts a complete song with no files", () => {
    expect(validateSubmission(song, goodSong, [], [])).toEqual([]);
  });

  it("requires the type's required detail fields and licenses", () => {
    expect(validateSubmission(song, { ...goodSong, detail: { ...goodSong.detail, writer: "" } }, [], []).join("\n")).toMatch(/Writer/);
    expect(validateSubmission(song, { ...goodSong, license: "CC0" }, [], []).join("\n")).toMatch(/license/);
    expect(validateSubmission(song, { ...goodSong, name: " " }, [], []).join("\n")).toMatch(/name/);
  });

  it("songs may be uploaded as WC, PD or CC-BY; the share-alike and non-commercial variants are harvest-only", () => {
    for (const license of ["WC", "PD", "CC-BY"]) expect(validateSubmission(song, { ...goodSong, license }, [], [])).toEqual([]);
    for (const license of ["CC-BY-NC", "CC-BY-SA", "CC-BY-NC-SA", "CC0", "ND"]) expect(validateSubmission(song, { ...goodSong, license }, [], []).join("\n")).toMatch(/license must be one of: WC, PD, CC-BY/);
  });

  it("returns every blocking problem at once", () => {
    const errors = validateSubmission(song, { name: " ", license: "CC0", detail: {} }, [file("virus.exe")], []);
    expect(errors.join("\n")).toMatch(/name/);
    expect(errors.join("\n")).toMatch(/license/);
    expect(errors.join("\n")).toMatch(/Writer/);
    expect(errors.join("\n")).toMatch(/Lyrics/);
    expect(errors.join("\n")).toMatch(/certified/);
    expect(errors.join("\n")).toMatch(/not an accepted file/);
    expect(errors.length).toBeGreaterThan(1);
  });

  it("requires attestations, including the file-conditional one", () => {
    expect(validateSubmission(song, { ...goodSong, detail: { ...goodSong.detail, certified: false } }, [], []).join("\n")).toMatch(/certified/);
    expect(validateSubmission(song, goodSong, [file("demoAudio.mp3")], []).join("\n")).toMatch(/recordingOwned/);
    expect(validateSubmission(song, { ...goodSong, detail: { ...goodSong.detail, recordingOwned: true } }, [file("demoAudio.mp3")], [])).toEqual([]);
  });

  it("rejects unconventional names, generated names, oversized and empty files", () => {
    expect(isUploadableName(song, "song.json")).toBe(false);
    expect(isUploadableName(song, "demo.mp3")).toBe(false);
    expect(isUploadableName(song, "../tune.abc")).toBe(false);
    expect(isUploadableName(song, "tune.abc")).toBe(true);
    expect(validateSubmission(song, goodSong, [file("virus.exe")], []).join("\n")).toMatch(/not an accepted file/);
    expect(validateSubmission(song, goodSong, [file("tune.abc", 2 * 1048576)], []).join("\n")).toMatch(/exceeds/);
    expect(validateSubmission(song, goodSong, [file("tune.abc", 0)], []).join("\n")).toMatch(/empty/);
  });

  it("requires the type's required roles on the resulting live set", () => {
    const payload = { name: "Wide", license: "CC0" };
    expect(validateSubmission(freeshow, payload, [], []).join("\n")).toMatch(/content file is required/);
    expect(validateSubmission(freeshow, payload, [file("content.fstemplate")], [])).toEqual([]);
    // a modification that only touches the thumb still passes because content is already live
    expect(validateSubmission(freeshow, payload, [file("thumb.png")], [file("content.fstemplate")])).toEqual([]);
    // removing the only content file is refused
    expect(validateSubmission(freeshow, payload, [file("content.fstemplate", 0, "remove")], [file("content.fstemplate")]).join("\n")).toMatch(/content file is required/);
  });

  it("caps the total size of the resulting set", () => {
    const big = file("content.fstemplate", 20 * 1048576);
    expect(validateSubmission(freeshow, { name: "x", license: "CC0" }, [big, file("thumb.png", 40 * 1048576)], []).join("\n")).toMatch(/exceeds/);
  });

  it("computes the resulting file set from live rows plus actions", () => {
    expect(resultingFileNames([file("a.mp3"), file("b.pdf")], [file("b.pdf", 0, "remove"), file("c.zip")]).sort()).toEqual(["a.mp3", "c.zip"]);
  });

  it("normalizes tags: trim, collapse spaces, title-case, drop empties, case-insensitive dedupe", () => {
    expect(normalizeTags(" hope ,  HOLY   spirit,Hope,  ")).toBe("Hope, Holy Spirit");
    expect(normalizeTags("")).toBe("");
    expect(normalizeTags(undefined)).toBe("");
  });
});

import { changedKeys, lintChordProBrackets, notAcceptedMessage, submissionType } from "../helpers/SubmitValidation";
import { ASSET_TYPES as LOCAL_TYPES } from "../helpers/AssetTypes";

const localSong = LOCAL_TYPES.song;

describe("proposal types", () => {
  const published = { isNewAsset: false, note: "fixed the chorus chords, they were a step flat" };

  it("defaults to correction for a published asset and new otherwise, and infers translation/arrangement from the parent-song fields the site sends", () => {
    expect(submissionType({}, true)).toBe("new");
    expect(submissionType({}, false)).toBe("correction");
    expect(submissionType({ type: "removal" }, false)).toBe("removal");
    expect(submissionType({ detail: { parentSongId: "p", relationLabel: "Translation (Spanish)" } }, true)).toBe("translation");
    expect(submissionType({ detail: { parentSongId: "p", translator: "Ana" } }, true)).toBe("translation");
    expect(submissionType({ detail: { parentSongId: "p", relationLabel: "Arrangement" } }, true)).toBe("arrangement");
  });

  it("rejects an unknown type outright", () => {
    expect(validateSubmission(song, { ...goodSong, type: "remix" }, [], [])).toEqual(["type must be one of: new, translation, arrangement, correction, additionalFile, recording, removal"]);
  });

  it("new song: happy path, and refused against a published asset", () => {
    expect(validateSubmission(song, goodSong, [], [], { type: "new", isNewAsset: true })).toEqual([]);
    expect(validateSubmission(song, goodSong, [], [], { type: "new", isNewAsset: false })).toEqual(["a new proposal creates a new song; send a correction, additionalFile or removal for a published one"]);
  });

  it("translation: translator, parent song, published parent and a different language", () => {
    const base = { ...goodSong, type: "translation", language: "Spanish", detail: { ...goodSong.detail, translator: "Ana", parentSongId: "asset000009" } };
    const parent = { status: "published", language: "English" };
    expect(validateSubmission(localSong, base, [], [], { parent })).toEqual([]);
    expect(validateSubmission(localSong, { ...base, detail: { ...base.detail, translator: " " } }, [], [], { parent })).toEqual(["Translator is required for a translation"]);
    expect(validateSubmission(localSong, { ...base, detail: { ...base.detail, parentSongId: "" } }, [], [], { parent })).toEqual(["The original song is required for a translation"]);
    expect(validateSubmission(localSong, base, [], [], { parent: null })).toEqual(["The original song is not in the library"]);
    expect(validateSubmission(localSong, base, [], [], { parent: { status: "unpublished", language: "English" } })).toEqual(["The original song is not in the library"]);
    expect(validateSubmission(localSong, { ...base, language: "English" }, [], [], { parent })).toEqual(["A translation must be in a different language from the original (English)"]);
    // no parent lookup: only the field rules apply
    expect(validateSubmission(localSong, { ...base, language: "English" }, [], [])).toEqual([]);
    expect(validateSubmission(localSong, { ...base, detail: { ...base.detail, translator: "x".repeat(121) } }, [], [], { parent })).toEqual(["Translator must be 120 characters or fewer"]);
  });

  it("arrangement: arranger and a published parent, any language", () => {
    const base = { ...goodSong, type: "arrangement", detail: { ...goodSong.detail, arranger: "Bo", parentSongId: "asset000009" } };
    expect(validateSubmission(localSong, base, [], [], { parent: { status: "published", language: "English" } })).toEqual([]);
    expect(validateSubmission(localSong, { ...base, detail: { ...base.detail, arranger: "" } }, [], [], { parent: { status: "published" } })).toEqual(["Arranger is required for an arrangement"]);
    expect(validateSubmission(localSong, { ...base, detail: { ...base.detail, parentSongId: undefined } }, [], [])).toEqual(["The original song is required for an arrangement"]);
    expect(validateSubmission(localSong, base, [], [], { parent: null })).toEqual(["The original song is not in the library"]);
  });

  it("correction: a note of at least 10 characters, on a published asset", () => {
    expect(validateSubmission(song, { ...goodSong, type: "correction" }, [], [], published)).toEqual([]);
    expect(validateSubmission(song, { ...goodSong, type: "correction" }, [], [], { isNewAsset: false, note: "typo" })).toEqual(["A note of at least 10 characters is required: say what changed and why"]);
    expect(validateSubmission(song, { ...goodSong, type: "correction" }, [], [], { isNewAsset: false })).toEqual(["A note of at least 10 characters is required: say what changed and why"]);
    expect(validateSubmission(song, { ...goodSong, type: "correction" }, [], [], { isNewAsset: true, note: published.note })).toEqual(["a correction proposal changes a published song; this song is not published yet"]);
  });

  it("additionalFile: note plus at least one added file", () => {
    expect(validateSubmission(song, { ...goodSong, type: "additionalFile" }, [file("tune.abc")], [], published)).toEqual([]);
    expect(validateSubmission(song, { ...goodSong, type: "additionalFile" }, [], [], published)).toEqual(["An additionalFile proposal must add a file"]);
    expect(validateSubmission(song, { ...goodSong, type: "additionalFile" }, [file("tune.abc", 0, "remove")], [file("tune.abc")], published)).toEqual(["An additionalFile proposal must add a file"]);
    expect(validateSubmission(song, { ...goodSong, type: "additionalFile" }, [file("tune.abc")], [], { isNewAsset: false, note: "" })).toEqual(["A note of at least 10 characters is required: say what changed and why"]);
  });

  it("removal: only a note — no files, no field changes, and never for an unpublished song", () => {
    const live = { name: "Hymn", license: "WC", detail: { writer: "Anon", chordPro: "x" } };
    const ctx = { type: "removal", isNewAsset: false, note: "I no longer want this song published", livePayload: live };
    expect(validateSubmission(song, live, [], [], ctx)).toEqual([]);
    // a payload that leaves fields out is not a change
    expect(validateSubmission(song, { type: "removal" }, [], [], ctx)).toEqual([]);
    expect(validateSubmission(song, { ...live, name: "Renamed", detail: { ...live.detail, chordPro: "y" } }, [], [], ctx)).toEqual(["A removal request cannot change fields (name, detail.chordPro)"]);
    expect(validateSubmission(song, live, [file("tune.abc")], [], ctx)).toEqual(["A removal request cannot include files"]);
    expect(validateSubmission(song, live, [], [], { ...ctx, note: "please" })).toEqual(["A note of at least 10 characters is required: say why the song should come down"]);
    expect(validateSubmission(song, live, [], [], { ...ctx, isNewAsset: true })).toEqual(["A removal request needs a published song"]);
    // the existing fields are not re-validated, so a live song with legacy gaps can still be taken down
    expect(validateSubmission(song, { name: " ", license: "nope" }, [], [], { ...ctx, livePayload: { name: " ", license: "nope" } })).toEqual([]);
  });

  it("changedKeys reports only keys the proposal sets to a different value", () => {
    expect(changedKeys({ name: "A", detail: { bpm: 80 } }, { detail: { bpm: 80 } })).toEqual([]);
    expect(changedKeys({ name: "A", detail: { bpm: 80 } }, { name: "B", detail: { bpm: 81, songKey: "G" } })).toEqual(["name", "detail.bpm", "detail.songKey"]);
  });
});

describe("ChordPro bracket lint", () => {
  it("names the line of every unmatched bracket and blocks submit", () => {
    expect(lintChordProBrackets("Verse 1\n[G]Sing\n[C sing\nmore]\nok [D]")).toEqual([
      "Unmatched bracket on line 3 — every [ needs a closing ]",
      "Unmatched bracket on line 4 — every [ needs a closing ]"
    ]);
    expect(lintChordProBrackets("[[G]]")).toEqual(["Unmatched bracket on line 1 — every [ needs a closing ]"]);
    expect(lintChordProBrackets("")).toEqual([]);
    expect(validateSubmission(song, { ...goodSong, detail: { ...goodSong.detail, chordPro: "Verse 1\n[G Sing" } }, [], [])).toEqual(["Unmatched bracket on line 2 — every [ needs a closing ]"]);
  });
});

describe("new song file roles", () => {
  it("accepts score, scoreImage and lyrics under their conventional names and keeps sheetPdf working", () => {
    for (const name of [
      "score.musicxml", "score.xml", "score.mxl", "score.mscz", "score.ly", "scoreImage.pdf", "scoreImage.png", "scoreImage.jpg", "scoreImage.jpeg", "scoreImage.tif", "lyrics.cho", "lyrics.crd", "lyrics.txt", "sheetPdf.pdf", "tune.abc"
    ]) {
      expect([name, isUploadableName(localSong, name)]).toEqual([name, true]);
    }
    expect(validateSubmission(localSong, goodSong, [file("score.musicxml", 20 * 1048576), file("scoreImage.tif", 20 * 1048576), file("lyrics.cho", 1000)], [])).toEqual([]);
  });

  it("rejects wrong names and extensions, and points lyrics.chordpro at lyrics.cho", () => {
    for (const name of [
      "score.pdf", "score.sib", "Score.musicxml", "scoreImage.gif", "lyrics.chordpro", "lyrics.doc", "chart.cho", "musicxml"
    ]) {
      expect([name, isUploadableName(localSong, name)]).toEqual([name, false]);
    }
    expect(validateSubmission(localSong, goodSong, [file("score.sib")], [])).toEqual(["score.sib is not an accepted file for Song"]);
    expect(validateSubmission(localSong, goodSong, [file("lyrics.chordpro")], [])).toEqual(["lyrics.chordpro is generated on publish — upload ChordPro text as lyrics.cho"]);
    expect(notAcceptedMessage(undefined, "x.exe")).toBe("x.exe is not an accepted file for this type");
  });

  it("enforces the per-role size caps (25MB scores, 1MB lyrics)", () => {
    expect(validateSubmission(localSong, goodSong, [file("score.mscz", 26 * 1048576)], [])).toEqual(["score.mscz exceeds the 25MB limit"]);
    expect(validateSubmission(localSong, goodSong, [file("lyrics.txt", 2 * 1048576)], [])).toEqual(["lyrics.txt exceeds the 1MB limit"]);
  });

  it("keeps the base registry's other types untouched and inserts the roles before the generated files", () => {
    expect(LOCAL_TYPES["freeshow/template"]).toBe(ASSET_TYPES["freeshow/template"]);
    const roles = localSong.files.map((f: any) => f.role);
    expect(roles.indexOf("lyrics")).toBeLessThan(roles.indexOf("song"));
    expect(roles).toEqual(expect.arrayContaining(["demoAudio", "sheetPdf", "score", "scoreImage", "lyrics", "manifest"]));
  });
});
