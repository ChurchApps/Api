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
