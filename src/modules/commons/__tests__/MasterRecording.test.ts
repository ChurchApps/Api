import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
jest.mock("../../../shared/helpers/index", () => ({ Permissions: { server: { admin: { contentType: "Server", action: "Admin" } } }, Environment: { commonsMusicEditors: "" } }));
jest.mock("../helpers/ContentLibraryHelper", () => ({ ContentLibraryHelper: { songJson: jest.fn(), renderChordpro: () => "" } }));

import { ASSET_TYPES } from "../helpers/AssetTypes";
import { ReviewerHelper } from "../helpers/ReviewerHelper";
import { isUploadableName, validateSubmission } from "../helpers/SubmitValidation";
import { packageFields } from "../helpers/publishHooks/song";

const song = ASSET_TYPES.song;
const goodSong = { name: "Hymn", license: "WC", detail: { writer: "Anon", chordPro: "Verse 1\n[G]Sing", certified: true } };
const withMaster = (masterLicense?: string) => ({ ...goodSong, detail: { ...goodSong.detail, recordingOwned: true, masterLicense } });
const file = (name: string, sizeBytes = 1000, action = "add") => ({ name, sizeBytes, action });
const published = { isNewAsset: false, note: "the studio master, mixed in the original key" };
const parse = (v: any) => (typeof v === "string" ? JSON.parse(v) : v);

describe("master recording: a second rights layer with its own license", () => {
  it("master.<audio ext> is an uploadable song file", () => {
    for (const name of ["master.wav", "master.mp3", "master.m4a", "master.flac"]) expect(isUploadableName(song, name)).toBe(true);
    expect(isUploadableName(song, "master.zip")).toBe(false);
  });

  it("a composition alone is a complete song; a master needs a license from the uploadable set", () => {
    expect(validateSubmission(song, goodSong, [], [])).toEqual([]);
    expect(validateSubmission(song, withMaster(), [file("master.wav")], []).join("\n")).toMatch(/masterLicense must be one of: WC, PD, CC-BY/);
    expect(validateSubmission(song, withMaster("CC-BY-NC"), [file("master.wav")], []).join("\n")).toMatch(/masterLicense must be one of/);
    for (const lic of ["WC", "PD", "CC-BY"]) expect(validateSubmission(song, withMaster(lic), [file("master.wav")], [])).toEqual([]);
  });

  it("the composition and the master may carry different licenses", () => {
    expect(validateSubmission(song, { ...withMaster("PD"), license: "CC-BY" }, [file("master.wav")], [])).toEqual([]);
  });

  it("a master is a recording: the ownership attestation is required", () => {
    expect(validateSubmission(song, { ...goodSong, detail: { ...goodSong.detail, masterLicense: "WC" } }, [file("master.wav")], []).join("\n")).toMatch(/recordingOwned/);
  });

  it("recording proposal: adds a master to a published song, with a note", () => {
    expect(validateSubmission(song, { ...withMaster("WC"), type: "recording" }, [file("master.wav")], [], published)).toEqual([]);
    expect(validateSubmission(song, { ...withMaster("WC"), type: "recording" }, [file("tune.abc")], [], published)).toEqual(["A recording proposal must add a master file"]);
    expect(validateSubmission(song, { ...withMaster("WC"), type: "recording" }, [file("master.wav")], [], { isNewAsset: false, note: "" })).toEqual(["A note of at least 10 characters is required: say what changed and why"]);
    expect(validateSubmission(song, { ...withMaster("WC"), type: "recording" }, [file("master.wav")], [], { isNewAsset: true, note: published.note }).join("\n")).toMatch(/not published yet/);
  });

  it("publish: the recording layer takes the master's license, the composition layers keep the asset's", () => {
    const f = packageFields({ chordPro: "Verse 1\n[G]x", songKey: "G" }, undefined, "CC-BY", "Ada", ["sources/master.wav", "masters/lyrics.chordpro"], ["sources/master.wav"], "PD");
    const rights = parse(f.rights);
    expect(rights.text).toEqual({ license: "CC-BY", holder: "Ada" });
    expect(rights.recording).toEqual({ license: "PD", holder: "Ada" });
  });

  it("publish: a master added later replaces the demo's recording layer; without a master the demo rides on the composition", () => {
    const existing = { chordPro: "Verse 1\n[G]x", rights: '{"text":{"license":"WC","holder":"Ada"},"recording":{"license":"WC","holder":"Ada"}}' };
    const later = packageFields({ chordPro: "Verse 1\n[G]x" }, existing, "WC", "Ada", ["sources/demoAudio.mp3", "sources/master.wav"], ["sources/master.wav"], "CC-BY");
    expect(parse(later.rights).recording).toEqual({ license: "CC-BY", holder: "Ada" });
    const demoOnly = packageFields({ chordPro: "Verse 1\n[G]x" }, undefined, "WC", "Ada", ["sources/demoAudio.mp3"], [], undefined);
    expect(parse(demoOnly.rights).recording).toEqual({ license: "WC", holder: "Ada" });
  });

  it("review: a master upload or a master license change is a rights change", () => {
    const live = { name: "Live", license: "WC", licenseVersion: "1.0", detail: { writer: "A", proAnswer: "No", recordingOwned: true, masterLicense: "WC" } };
    expect(ReviewerHelper.rightsChange(live, live, [{ name: "tune.abc", action: "add" }])).toBeUndefined();
    expect(ReviewerHelper.rightsChange(live, live, [{ name: "master.wav", action: "add" }])).toBe("master.wav");
    expect(ReviewerHelper.rightsChange(live, { ...live, detail: { ...live.detail, masterLicense: "PD" } })).toBe("masterLicense");
  });
});
