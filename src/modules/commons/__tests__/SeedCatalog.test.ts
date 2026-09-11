import * as fs from "fs";
import * as path from "path";

let n = 0;
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => `seedid${String(++n).padStart(5, "0")}` } }));

import { buildCatalog, chordproBody } from "../../../../tools/commons-seed/catalog";

const REPO = path.join(__dirname, "fixtures", "package-repo");
const OWN = "songs/en/public-domain/a-child-of-light-fixsong0001";
const WORK = "works/abide-fixture";

describe("buildCatalog seeds the database from the package, with the catalog row as the fallback", () => {
  const { assets, songs, authors, assetFiles, submissions } = buildCatalog(REPO) as any;
  const own = songs.find((s: any) => s.assetId === "fixsong0001");
  const inherited = songs.find((s: any) => s.assetId === "fixsong0002");
  const namesFor = (id: string) => assetFiles.filter((f: any) => f.assetId === id).map((f: any) => f.name).sort();

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
    expect(own).toMatchObject({ confidence: "proofread-score", tune: null, year: 1877, scripture: "Rom 8:14-17" });
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

  it("publishes the song key and marks a served ABC score in masters/ as the notes master", () => {
    expect(JSON.parse(own.publishedKeys)).toEqual(["Eb"]);
    expect(own.scoreSource).toBe("master");
    expect(inherited.scoreSource).toBe("master");
  });

  it("registers one live assetFiles row per served file under its catalog key — the repo path is the bucket key, nothing is copied", () => {
    expect(namesFor("fixsong0001")).toEqual([
      `${OWN}/derivatives/attribution.txt`,
      `${OWN}/derivatives/chart.chordpro`,
      `${OWN}/derivatives/duration.json`,
      `${OWN}/derivatives/slides.json`,
      `${OWN}/derivatives/timing.json`,
      `${OWN}/masters/cover.webp`,
      `${OWN}/masters/score.musicxml`,
      `${OWN}/masters/song.json`,
      `${OWN}/sources/tune.abc`,
      `${OWN}/sources/tune.mid`
    ]);
    expect(namesFor("fixsong0001")).not.toContainEqual(expect.stringContaining("chart.pdf"));
    expect(namesFor("fixsong0001")).not.toContainEqual(expect.stringContaining("cover-thumb"));
    // lyrics.chordpro is served but not registered: the publish hook owns that row
    expect(namesFor("fixsong0001")).not.toContainEqual(expect.stringContaining("lyrics.chordpro"));
    expect(assetFiles.every((f: any) => !f.name.includes("\\"))).toBe(true);
    expect(assetFiles.find((f: any) => f.assetId === "fixsong0001" && f.name === `${OWN}/derivatives/duration.json`).sizeBytes).toBeGreaterThan(0);
    expect(new Set(assetFiles.map((f: any) => f.id)).size).toBe(assetFiles.length);
    expect(buildCatalog(REPO)).not.toHaveProperty("copies");
  });

  it("finds a works-only row's package by id and points inherited files at the work's own keys; song.json anchors the song's package", () => {
    expect(namesFor("fixsong0002")).toEqual([
      "songs/de/public-domain/bleib-bei-uns-fixsong0002/masters/song.json",
      `${WORK}/derivatives/cover-thumb.webp`,
      `${WORK}/masters/score.musicxml`,
      `${WORK}/sources/tune.abc`,
      `${WORK}/sources/tune.mid`
    ]);
  });

  it("maps the catalog row's url columns to files by catalog key and carries its confidence onto the songs row", () => {
    const row = JSON.parse(fs.readFileSync(path.join(REPO, "catalog.json"), "utf8")).rows.find((r: any) => r.id === "fixsong0001");
    for (const col of ["midiUrl", "abcUrl", "artUrl", "lyricsUrl"]) expect(namesFor("fixsong0001")).toContain(row[col]);
    expect(own.confidence).toBe(row.confidence);
    expect(inherited.confidence).toBe("lyrics-only");
    expect(["proofread-score", "converted-from-abc", "generated-from-midi", "chart-only", "lyrics-only"]).toContain(own.confidence);
  });

  it("keeps the writer portrait as a key under the commons prefix, and none when no row names one", () => {
    expect(authors.every((a: any) => a.portraitUrl === null)).toBe(true);
  });
});

describe("package path helpers", () => {

  it("chordproBody strips the directive header and the one blank line after it, keeping the body verbatim", () => {
    expect(chordproBody("{title: T}\n{key: G}\n\nVerse 1\n[G]Sing\n")).toBe("Verse 1\n[G]Sing");
    expect(chordproBody("Verse 1\nNo header\n")).toBe("Verse 1\nNo header");
    expect(chordproBody("{title: T}\r\n\r\nVerse 1\r\nCRLF\r\n")).toBe("Verse 1\nCRLF");
  });
});
