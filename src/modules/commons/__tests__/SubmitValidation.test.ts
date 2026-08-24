import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });

import { ASSET_TYPES } from "../__mocks__/churchappsHelpers";
import { isUploadableName, resultingFileNames, validateSubmission } from "../helpers/SubmitValidation";

const song = ASSET_TYPES.song;
const freeshow = ASSET_TYPES["freeshow/template"];
const goodSong = { name: "Hymn", license: "WC", detail: { writer: "Anon", chordPro: "Verse 1\n[G]Sing", certified: true } };
const file = (name: string, sizeBytes = 1000, action = "add") => ({ name, sizeBytes, action });

describe("registry-driven submission validation", () => {
  it("accepts a complete song with no files", () => {
    expect(validateSubmission(song, goodSong, [], [])).toBeNull();
  });

  it("requires the type's required detail fields and licenses", () => {
    expect(validateSubmission(song, { ...goodSong, detail: { ...goodSong.detail, writer: "" } }, [], [])).toMatch(/Writer/);
    expect(validateSubmission(song, { ...goodSong, license: "CC0" }, [], [])).toMatch(/license/);
    expect(validateSubmission(song, { ...goodSong, name: " " }, [], [])).toMatch(/name/);
  });

  it("requires attestations, including the file-conditional one", () => {
    expect(validateSubmission(song, { ...goodSong, detail: { ...goodSong.detail, certified: false } }, [], [])).toMatch(/certified/);
    expect(validateSubmission(song, goodSong, [file("demoAudio.mp3")], [])).toMatch(/recordingOwned/);
    expect(validateSubmission(song, { ...goodSong, detail: { ...goodSong.detail, recordingOwned: true } }, [file("demoAudio.mp3")], [])).toBeNull();
  });

  it("rejects unconventional names, generated names, oversized and empty files", () => {
    expect(isUploadableName(song, "song.json")).toBe(false);
    expect(isUploadableName(song, "demo.mp3")).toBe(false);
    expect(isUploadableName(song, "../tune.abc")).toBe(false);
    expect(isUploadableName(song, "tune.abc")).toBe(true);
    expect(validateSubmission(song, goodSong, [file("virus.exe")], [])).toMatch(/not an accepted file/);
    expect(validateSubmission(song, goodSong, [file("tune.abc", 2 * 1048576)], [])).toMatch(/exceeds/);
    expect(validateSubmission(song, goodSong, [file("tune.abc", 0)], [])).toMatch(/empty/);
  });

  it("requires the type's required roles on the resulting live set", () => {
    const payload = { name: "Wide", license: "CC0" };
    expect(validateSubmission(freeshow, payload, [], [])).toMatch(/content file is required/);
    expect(validateSubmission(freeshow, payload, [file("content.fstemplate")], [])).toBeNull();
    // a modification that only touches the thumb still passes because content is already live
    expect(validateSubmission(freeshow, payload, [file("thumb.png")], [file("content.fstemplate")])).toBeNull();
    // removing the only content file is refused
    expect(validateSubmission(freeshow, payload, [file("content.fstemplate", 0, "remove")], [file("content.fstemplate")])).toMatch(/content file is required/);
  });

  it("caps the total size of the resulting set", () => {
    const big = file("content.fstemplate", 20 * 1048576);
    expect(validateSubmission(freeshow, { name: "x", license: "CC0" }, [big, file("thumb.png", 40 * 1048576)], [])).toMatch(/exceeds/);
  });

  it("computes the resulting file set from live rows plus actions", () => {
    expect(resultingFileNames([file("a.mp3"), file("b.pdf")], [file("b.pdf", 0, "remove"), file("c.zip")]).sort()).toEqual(["a.mp3", "c.zip"]);
  });
});
