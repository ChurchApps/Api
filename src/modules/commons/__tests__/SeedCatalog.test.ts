import * as path from "path";

let n = 0;
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => `seedid${String(++n).padStart(5, "0")}` } }));

import { buildCatalog } from "../../../../tools/commons-seed/catalog";

const REPO = path.join(__dirname, "fixtures", "package-repo");

describe("buildCatalog reads the package, not just the catalog row", () => {
  const { songs, assetFiles, copies } = buildCatalog(REPO);
  const own = songs.find((s) => s.assetId === "fixsong0001");
  const inherited = songs.find((s) => s.assetId === "fixsong0002");
  const copiesFor = (id: string) => copies.filter((c) => c.to.startsWith(`assets/song/${id}/`)).map((c) => `${c.from} -> ${c.to.split("/").pop()}`);

  it("takes confidence from the row and derives firstLine / hasChords from the ChordPro", () => {
    expect(own).toMatchObject({ confidence: "converted-from-abc", firstLine: "My Father is rich in houses and lands, He holdeth", hasChords: true, tune: null });
    expect(inherited).toMatchObject({ confidence: "lyrics-only", firstLine: "Ach bleib mit deiner Gnade", hasChords: false });
  });

  it("reads rights, form and a missing meter from masters/song.json, and sing time from duration.json", () => {
    expect(JSON.parse(own.rights)).toMatchObject({ text: { license: "PD", basis: "published 1877" }, artwork: { basis: "worshipcommons" }, recording: null });
    expect(JSON.parse(own.form)).toEqual({ status: "draft", sections: [{ label: "Verse 1", lyric: 1 }, { label: "Chorus", lyric: 2 }], defaultOrder: ["Verse 1", "Chorus"] });
    expect(own.singTimeSeconds).toBe(152);
    expect(own.meter).toBeNull();
    expect(inherited.meter).toBe("7.6.7.6");
    expect(inherited.singTimeSeconds).toBeNull();
    expect(JSON.parse(inherited.form).status).toBe("approved");
  });

  it("publishes the song key and marks a served score as converted from abc", () => {
    expect(JSON.parse(own.publishedKeys)).toEqual(["Eb"]);
    expect(own.scoreSource).toBe("abc");
    expect(inherited.scoreSource).toBe("abc");
  });

  it("copies the package's own derivatives flat into the live folder", () => {
    expect(copiesFor("fixsong0001")).toEqual(expect.arrayContaining([
      "songs/en/public-domain/a-child-of-light/sources/tune.mid -> tune.mid",
      "songs/en/public-domain/a-child-of-light/derivatives/timing.json -> timing.json",
      "songs/en/public-domain/a-child-of-light/derivatives/score.musicxml -> score.musicxml",
      "songs/en/public-domain/a-child-of-light/derivatives/slides.json -> slides.json",
      "songs/en/public-domain/a-child-of-light/derivatives/chart.chordpro -> chart.chordpro",
      "songs/en/public-domain/a-child-of-light/derivatives/attribution.txt -> attribution.txt",
      "songs/en/public-domain/a-child-of-light/derivatives/duration.json -> duration.json"
    ]));
    expect(copiesFor("fixsong0001")).not.toContainEqual(expect.stringContaining("chart.pdf"));
    expect(copiesFor("fixsong0001")).not.toContainEqual(expect.stringContaining("cover-thumb"));
  });

  it("finds a works-only row's package by id and inherits the work's score and thumb, the way abcUrl does", () => {
    expect(copiesFor("fixsong0002")).toEqual(expect.arrayContaining([
      "works/abide-fixture/sources/tune.abc -> tune.abc",
      "works/abide-fixture/derivatives/score.musicxml -> score.musicxml",
      "works/abide-fixture/derivatives/cover-thumb.webp -> cover-thumb.webp"
    ]));
    expect(copiesFor("fixsong0002")).not.toContainEqual(expect.stringContaining("slides.json"));
  });

  it("registers one live assetFiles row per copied file with its size", () => {
    const names = assetFiles.filter((f) => f.assetId === "fixsong0001").map((f) => f.name).sort();
    expect(names).toEqual(["attribution.txt", "chart.chordpro", "cover.webp", "duration.json", "score.musicxml", "slides.json", "timing.json", "tune.abc", "tune.mid"]);
    expect(assetFiles.find((f) => f.assetId === "fixsong0001" && f.name === "duration.json").sizeBytes).toBeGreaterThan(0);
    expect(new Set(assetFiles.map((f) => f.id)).size).toBe(assetFiles.length);
  });
});
