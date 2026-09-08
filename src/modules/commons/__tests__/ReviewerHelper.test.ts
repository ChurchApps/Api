import "reflect-metadata";
jest.mock("@churchapps/helpers", () => require("../__mocks__/churchappsHelpers"), { virtual: true });
const mockEnv = { commonsMusicEditors: "" };
jest.mock("../../../shared/helpers/index", () => ({
  Permissions: { server: { admin: { contentType: "Server", action: "Admin" } } },
  Environment: mockEnv
}));

import { ReviewerHelper } from "../helpers/ReviewerHelper";

const user = (over: any = {}) => ({ id: "user0000001", email: "someone@example.com", checkAccess: () => false, ...over });

describe("ReviewerHelper.isMusicEditor / canReview", () => {
  beforeEach(() => { mockEnv.commonsMusicEditors = ""; });

  it("matches a listed user id or email, ignoring spacing and email case", () => {
    mockEnv.commonsMusicEditors = " user0000001 ,Editor@Example.com, ";
    expect(ReviewerHelper.isMusicEditor(user())).toBe(true);
    expect(ReviewerHelper.isMusicEditor(user({ id: "other000001", email: "editor@example.com" }))).toBe(true);
    expect(ReviewerHelper.isMusicEditor(user({ id: "other000001", email: "nobody@example.com" }))).toBe(false);
  });

  it("is nobody when the list is empty or the user is anonymous", () => {
    expect(ReviewerHelper.isMusicEditor(user())).toBe(false);
    mockEnv.commonsMusicEditors = "user0000001";
    expect(ReviewerHelper.isMusicEditor(user({ id: undefined }))).toBe(false);
    expect(ReviewerHelper.isMusicEditor(undefined)).toBe(false);
  });

  it("does not let a blank email match a blank list entry", () => {
    mockEnv.commonsMusicEditors = ", ,";
    expect(ReviewerHelper.isMusicEditor(user({ email: "" }))).toBe(false);
  });

  it("canReview is server admin or music editor, never anonymous", () => {
    expect(ReviewerHelper.canReview(user({ checkAccess: () => true }))).toBe(true);
    expect(ReviewerHelper.canReview(user())).toBe(false);
    mockEnv.commonsMusicEditors = "user0000001";
    expect(ReviewerHelper.canReview(user())).toBe(true);
    expect(ReviewerHelper.canReview(user({ id: "", checkAccess: () => true }))).toBe(false);
  });
});

describe("ReviewerHelper.rightsChange", () => {
  const live = () => ({ name: "Live", license: "WC", licenseVersion: "1.0", detail: { writer: "A", proAnswer: "No", recordingOwned: false } });

  it("is quiet for a proofreading correction", () => {
    expect(ReviewerHelper.rightsChange(live(), { ...live(), name: "Fixed", detail: { ...live().detail, writer: "B", chordPro: "[G]x" } }, [{ name: "tune.abc", action: "add" }])).toBeUndefined();
  });

  it("treats a first publish as a rights decision", () => {
    expect(ReviewerHelper.rightsChange(undefined, { name: "New", license: "WC" })).toBe("license");
  });

  it.each([
    ["license", { license: "CC-BY" }],
    ["licenseVersion", { licenseVersion: "4.0" }],
    ["recordingOwned", { detail: { proAnswer: "No", recordingOwned: true } }],
    ["proAnswer", { detail: { proAnswer: "Yes, PRS", recordingOwned: false } }]
  ])("names %s when it changes", (key, patch) => {
    expect(ReviewerHelper.rightsChange(live(), { ...live(), ...patch })).toBe(key);
  });

  it("ignores a licenseVersion that is only being filled in for a legacy song", () => {
    const legacy = { ...live(), licenseVersion: undefined };
    expect(ReviewerHelper.rightsChange(legacy, { ...live(), licenseVersion: "1.0" })).toBeUndefined();
  });

  it("treats unset and blank proAnswer alike", () => {
    expect(ReviewerHelper.rightsChange({ ...live(), detail: { recordingOwned: false } }, { ...live(), detail: { proAnswer: "  ", recordingOwned: false } })).toBeUndefined();
  });

  it("flags a new or replaced demo recording or stems on a live song, but not their removal", () => {
    expect(ReviewerHelper.rightsChange(live(), live(), [{ name: "demoAudio.mp3", action: "add" }])).toBe("demoAudio.mp3");
    expect(ReviewerHelper.rightsChange(live(), live(), [{ name: "stemsZip.zip", action: "replace" }])).toBe("stemsZip.zip");
    expect(ReviewerHelper.rightsChange(live(), live(), [{ name: "demoAudio.mp3", action: "remove" }, { name: "sheetPdf.pdf", action: "add" }])).toBeUndefined();
  });
});

describe("ReviewerHelper.parseDeclined", () => {
  const proposed = [{ name: "tune.abc", action: "add" }, { name: "sheetPdf.pdf", action: "replace" }, { name: "demoAudio.mp3", action: "remove" }];

  it("accepts nothing, trims and clips reasons", () => {
    expect(ReviewerHelper.parseDeclined(undefined, proposed, [], [])).toEqual({ declined: [] });
    expect(ReviewerHelper.parseDeclined([{ name: " sheetPdf.pdf ", reason: ` ${"r".repeat(250)} ` }], proposed, [], [])).toEqual({ declined: [{ name: "sheetPdf.pdf", reason: "r".repeat(200) }] });
  });

  it.each([
    ["a non-list", "sheetPdf.pdf", "must be a list"],
    ["an unknown file", [{ name: "cover.webp", reason: "x" }], "not a proposed file"],
    ["a removal", [{ name: "demoAudio.mp3", reason: "x" }], "not a proposed file"],
    ["a missing reason", [{ name: "tune.abc", reason: "  " }], "reason is required"],
    ["a duplicate", [{ name: "tune.abc", reason: "a" }, { name: "tune.abc", reason: "b" }], "listed twice"]
  ])("refuses %s", (_what, raw, message) => {
    const out = ReviewerHelper.parseDeclined(raw, proposed, [], []);
    expect(out.declined).toEqual([]);
    expect(out.error).toContain(message);
  });

  it("refuses to decline a required file unless a live copy remains", () => {
    const files = [{ name: "content.fstemplate", action: "replace" }];
    expect(ReviewerHelper.parseDeclined([{ name: "content.fstemplate", reason: "x" }], files, [], ["content"]).error).toContain("required");
    expect(ReviewerHelper.parseDeclined([{ name: "content.fstemplate", reason: "x" }], files, ["content.fstemplate"], ["content"]).error).toBeUndefined();
  });
});
