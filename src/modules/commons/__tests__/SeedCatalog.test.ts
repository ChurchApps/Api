import * as path from "path";

let n = 0;
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => `seedid${String(++n).padStart(5, "0")}` } }));

import { buildCatalog, chordproBody, packageName } from "../../../../tools/commons-seed/catalog";

const REPO = path.join(__dirname, "fixtures", "package-repo");

describe("buildCatalog seeds the database from the package, with the catalog row as the fallback", () => {
  const { assets, songs, authors, assetFiles, submissions, copies } = buildCatalog(REPO);
  const own = songs.find((s) => s.assetId === "fixsong0001");
  const inherited = songs.find((s) => s.assetId === "fixsong0002");
  const copiesFor = (id: string) => copies.filter((c) => c.to.startsWith(`assets/song/${id}/`)).map((c) => `${c.from} -> ${c.to.replace(`assets/song/${id}/`, "")}`);
  const namesFor = (id: string) => assetFiles.filter((f) => f.assetId === id).map((f) => f.name).sort();

  it("builds the song row from masters/song.json and masters/lyrics.chordpro, not the catalog row", () => {
    // song.json says bpm 96 and three themes; the catalog row says 120 and two
    expect(own.bpm).toBe(96);
    expect(assets.find((a) => a.id === "fixsong0001").tags).toBe("Assurance,Kids,Heritage");
    // the ChordPro body comes from lyrics.chordpro with the directive header stripped
    expect(own.chordPro).toBe("Verse 1\n[Eb]My Father is rich in houses and lands, He [Bb7]holdeth\nthe wealth [Eb]of the world\n\nChorus\nI'm a child of the King\nA child of the King");
    expect(own.firstLine).toBe("My Father is rich in houses and lands, He holdeth");
    expect(own.hasChords).toBe(true);
    // the Imported submission carries the same record
    expect(JSON.parse(submissions.find((s) => s.assetId === "fixsong0001").payload).detail).toMatchObject({ bpm: 96, writer: "Harriet Buell" });
    expect(authors.map((a) => a.name).sort()).toEqual(["Harriet Buell", "Joshua Stegmann"]);
  });

  it("merges the harvested sources: hymnal count from sources/hymnary.json and the video from sources/video.json", () => {
    expect(own.hymnalCount).toBe(512);
    expect(own.videoUrl).toBe("https://www.youtube.com/watch?v=fixtureVid01");
    expect(inherited.hymnalCount).toBe(0); // no hymnary.json: catalog value
    expect(inherited.videoUrl).toBeNull();
  });

  it("falls back to the catalog row for what the package lacks: confidence, parentSongId, a missing song.json field", () => {
    expect(own).toMatchObject({ confidence: "converted-from-abc", tune: null, year: 1877, scripture: "Rom 8:14-17" });
    expect(inherited).toMatchObject({ confidence: "lyrics-only", parentSongId: "fixsong0001", relationLabel: "German original", firstLine: "Ach bleib mit deiner Gnade", hasChords: false });
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

  it("copies the package's files into sources/ masters/ derivatives/ under the live folder, keeping each file's folder", () => {
    expect(copiesFor("fixsong0001")).toEqual(expect.arrayContaining([
      "songs/en/public-domain/a-child-of-light/sources/tune.mid -> sources/tune.mid",
      "songs/en/public-domain/a-child-of-light/sources/tune.abc -> sources/tune.abc",
      "songs/en/public-domain/a-child-of-light/masters/cover.webp -> masters/cover.webp",
      "songs/en/public-domain/a-child-of-light/masters/song.json -> masters/song.json",
      "songs/en/public-domain/a-child-of-light/masters/lyrics.chordpro -> masters/lyrics.chordpro",
      "songs/en/public-domain/a-child-of-light/derivatives/timing.json -> derivatives/timing.json",
      "songs/en/public-domain/a-child-of-light/derivatives/score.musicxml -> derivatives/score.musicxml",
      "songs/en/public-domain/a-child-of-light/derivatives/slides.json -> derivatives/slides.json",
      "songs/en/public-domain/a-child-of-light/derivatives/chart.chordpro -> derivatives/chart.chordpro",
      "songs/en/public-domain/a-child-of-light/derivatives/attribution.txt -> derivatives/attribution.txt",
      "songs/en/public-domain/a-child-of-light/derivatives/duration.json -> derivatives/duration.json"
    ]));
    expect(copiesFor("fixsong0001")).not.toContainEqual(expect.stringContaining("chart.pdf"));
    expect(copiesFor("fixsong0001")).not.toContainEqual(expect.stringContaining("cover-thumb"));
    expect(copies.every((c) => !c.to.includes("\\"))).toBe(true);
  });

  it("finds a works-only row's package by id and lands the work's inherited files under the song's own package", () => {
    expect(copiesFor("fixsong0002")).toEqual(expect.arrayContaining([
      "works/abide-fixture/sources/tune.abc -> sources/tune.abc",
      "works/abide-fixture/sources/tune.mid -> sources/tune.mid",
      "works/abide-fixture/derivatives/score.musicxml -> derivatives/score.musicxml",
      "works/abide-fixture/derivatives/cover-thumb.webp -> derivatives/cover-thumb.webp",
      "songs/de/public-domain/bleib-bei-uns/masters/song.json -> masters/song.json"
    ]));
    expect(copiesFor("fixsong0002")).not.toContainEqual(expect.stringContaining("slides.json"));
  });

  it("registers one live assetFiles row per served file under its package-relative name, with its size", () => {
    expect(namesFor("fixsong0001")).toEqual([
      "derivatives/attribution.txt",
      "derivatives/chart.chordpro",
      "derivatives/duration.json",
      "derivatives/score.musicxml",
      "derivatives/slides.json",
      "derivatives/timing.json",
      "masters/cover.webp",
      "sources/tune.abc",
      "sources/tune.mid"
    ]);
    // song.json and lyrics.chordpro are copied but not registered: the publish hook owns those rows
    expect(namesFor("fixsong0002")).toEqual(["derivatives/cover-thumb.webp", "derivatives/score.musicxml", "sources/tune.abc", "sources/tune.mid"]);
    expect(assetFiles.find((f) => f.assetId === "fixsong0001" && f.name === "derivatives/duration.json").sizeBytes).toBeGreaterThan(0);
    expect(new Set(assetFiles.map((f) => f.id)).size).toBe(assetFiles.length);
  });

  it("copies nothing outside the packages: no writers/ mirror when no row names a portrait", () => {
    expect(copies.some((c) => c.to.startsWith("writers/"))).toBe(false);
    expect(authors.every((a) => a.portraitUrl === null)).toBe(true);
  });
});

describe("package path helpers", () => {
  it("packageName keeps the package folder and treats anything else as a source", () => {
    expect(packageName("songs/en/pd/x/sources/tune.mid")).toBe("sources/tune.mid");
    expect(packageName("works/abide/derivatives/score.musicxml")).toBe("derivatives/score.musicxml");
    expect(packageName("songs/en/pd/x/masters/cover.webp")).toBe("masters/cover.webp");
    expect(packageName("songs/en/pd/x/demoAudio.mp3")).toBe("sources/demoAudio.mp3");
  });

  it("chordproBody strips the directive header and the one blank line after it, keeping the body verbatim", () => {
    expect(chordproBody("{title: T}\n{key: G}\n\nVerse 1\n[G]Sing\n")).toBe("Verse 1\n[G]Sing");
    expect(chordproBody("Verse 1\nNo header\n")).toBe("Verse 1\nNo header");
    expect(chordproBody("{title: T}\r\n\r\nVerse 1\r\nCRLF\r\n")).toBe("Verse 1\nCRLF");
  });
});
