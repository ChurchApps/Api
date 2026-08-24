import { assetSubmitError, demoOwnershipMissing, MAX_FILE_BYTES } from "../helpers/SubmitValidation.js";

describe("demoOwnershipMissing", () => {
  it("does not require ownership when no demo is attached", () => {
    expect(demoOwnershipMissing({})).toBe(false);
    expect(demoOwnershipMissing({ files: {} })).toBe(false);
    expect(demoOwnershipMissing({ files: { demoAudio: { base64: "" } } })).toBe(false);
  });

  it("refuses a demo without a flag", () => {
    expect(demoOwnershipMissing({ files: { demoAudio: { base64: "abc" } } })).toBe(true);
    expect(demoOwnershipMissing({ files: { demoAudio: { base64: "abc" } }, recordingOwned: false })).toBe(true);
    expect(demoOwnershipMissing({ files: { demoAudio: { base64: "abc" } }, demoOwned: false })).toBe(true);
  });

  it("allows a demo with recordingOwned or demoOwned", () => {
    expect(demoOwnershipMissing({ files: { demoAudio: { base64: "abc" } }, recordingOwned: true })).toBe(false);
    expect(demoOwnershipMissing({ files: { demoAudio: { base64: "abc" } }, demoOwned: true })).toBe(false);
  });
});

describe("assetSubmitError", () => {
  const valid = { assetType: "freeshow/template", name: "Advent Slides", license: "CC0", file: { base64: "abc" } };

  it("accepts a complete submission", () => {
    expect(assetSubmitError(valid, 1024)).toBeNull();
  });

  it("requires assetType and name", () => {
    expect(assetSubmitError({ ...valid, assetType: undefined }, 1024)).toMatch(/assetType/);
    expect(assetSubmitError({ ...valid, name: undefined }, 1024)).toMatch(/name/);
  });

  it("only allows the CC0/CC-BY/WC licenses", () => {
    for (const license of ["CC0", "CC-BY", "WC"]) expect(assetSubmitError({ ...valid, license }, 1024)).toBeNull();
    expect(assetSubmitError({ ...valid, license: "GPL" }, 1024)).toMatch(/license/);
    expect(assetSubmitError({ ...valid, license: undefined }, 1024)).toMatch(/license/);
  });

  it("caps the payload at 25MB and rejects empty files", () => {
    expect(assetSubmitError(valid, MAX_FILE_BYTES)).toBeNull();
    expect(assetSubmitError(valid, MAX_FILE_BYTES + 1)).toMatch(/25MB/);
    expect(assetSubmitError(valid, 0)).toMatch(/empty/);
    expect(assetSubmitError({ ...valid, file: undefined }, 0)).toMatch(/file is required/);
  });
});
