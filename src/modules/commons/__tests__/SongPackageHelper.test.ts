import { SongPackageHelper } from "../helpers/SongPackageHelper";

const CHART = "{title: Amazing Grace}\n{key: G}\n\nVerse 1\n[G]Amazing   grace! how [C]sweet the [G]sound,\nthat saved a wretch like [D]me!\n\nChorus\nPraise [G]God";

describe("SongPackageHelper text readers", () => {
  it("firstLine skips directives and stanza labels, strips chords and collapses whitespace", () => {
    expect(SongPackageHelper.firstLine(CHART)).toBe("Amazing grace! how sweet the sound,");
    expect(SongPackageHelper.firstLine("Verse 1\nAch bleib mit deiner Gnade\nBei uns")).toBe("Ach bleib mit deiner Gnade");
    expect(SongPackageHelper.firstLine("")).toBeNull();
    expect(SongPackageHelper.firstLine(undefined)).toBeNull();
  });

  it("hasChords needs a bracketed chord, not any bracket", () => {
    expect(SongPackageHelper.hasChords(CHART)).toBe(true);
    expect(SongPackageHelper.hasChords("Verse 1\nSing [x2] loudly")).toBe(false);
    expect(SongPackageHelper.hasChords("Verse 1\nSing [Bb7]loudly")).toBe(true);
  });

  it("drafts a form map from the stanza labels", () => {
    expect(SongPackageHelper.draftForm(CHART)).toEqual({ status: "draft", sections: [{ label: "Verse 1", lyric: 1 }, { label: "Chorus", lyric: 2 }], defaultOrder: ["Verse 1", "Chorus"] });
    expect(SongPackageHelper.draftForm("")).toBeNull();
  });

  it("reads the scripture book off a reference", () => {
    expect(SongPackageHelper.scriptureBook("Rom 8:14-17")).toBe("Rom");
    expect(SongPackageHelper.scriptureBook("1 John 4:7")).toBe("1 John");
    expect(SongPackageHelper.scriptureBook("Johannes 15,10")).toBe("Johannes");
    expect(SongPackageHelper.scriptureBook("Psalm 46")).toBe("Psalm");
    expect(SongPackageHelper.scriptureBook("")).toBeNull();
  });
});

describe("SongPackageHelper.baseConfidence", () => {
  it("follows the score source, then the chords", () => {
    expect(SongPackageHelper.baseConfidence({ hasScore: true, scoreSource: "master", hasChords: true })).toBe("proofread-score");
    expect(SongPackageHelper.baseConfidence({ hasScore: true, scoreSource: "abc", hasChords: false })).toBe("converted-from-abc");
    expect(SongPackageHelper.baseConfidence({ hasScore: true, scoreSource: "midi", hasChords: false })).toBe("generated-from-midi");
    expect(SongPackageHelper.baseConfidence({ hasScore: false, scoreSource: "abc", hasChords: true })).toBe("chart-only");
    expect(SongPackageHelper.baseConfidence({ hasScore: false, hasChords: false })).toBe("lyrics-only");
  });
});

const row = (): any => ({
  id: "song0000001", title: "Amazing Grace", writer: "John Newton", year: 1779, language: "English", license: "PD", licenseVersion: null, status: "published",
  themes: "Grace,Salvation", meter: "CM", scripture: "Eph 2:8", songKey: "G", hymnalCount: 1200, rank: 70, portraitKey: "commons/writers/n.jpg", qualityScore: 88, qualityDetail: "{}", proAnswer: "no", submittedBy: "u1",
  confidence: "converted-from-abc", firstLine: "Amazing grace! how sweet the sound,", tune: null, hasChords: 1, featured: 1, recommendedKey: null, singTimeSeconds: 150,
  rights: JSON.stringify({ text: { license: "PD" }, tune: { license: "PD" }, arrangement: null, recording: null, artwork: null }),
  form: JSON.stringify({ status: "draft", sections: [{ label: "Verse 1", lyric: 1 }], defaultOrder: ["Verse 1"] }),
  publishedKeys: JSON.stringify(["G", "F"]), listenedKeys: null, scoreSource: "abc", recommendedKeyReason: null, sundayReadyBy: null, sundayReadyAt: null
});
const URLS = { score: "u/score.musicxml", slides: "u/slides.json", timing: "u/timing.json", attribution: "u/attribution.txt" };

describe("SongPackageHelper.summary", () => {
  it("adds the contract booleans from the served files and drops the reviewer-only columns", () => {
    const s = SongPackageHelper.summary(row(), URLS);
    expect(s).toMatchObject({ confidence: "converted-from-abc", sundayReady: false, featured: true, firstLine: "Amazing grace! how sweet the sound,", tune: null, hymnalCount: 1200, hasChords: true, hasScore: true, hasSlides: true, hasTiming: true, hasAccompaniment: false, recommendedKey: null, singTimeSeconds: 150, rank: 70 });
    expect(s).not.toHaveProperty("qualityScore");
    expect(s).not.toHaveProperty("portraitKey");
    expect(SongPackageHelper.summary({ ...row(), confidence: "sunday-ready" }, {})).toMatchObject({ sundayReady: true, hasScore: false, hasSlides: false, hasTiming: false });
  });
});

describe("SongPackageHelper.detail", () => {
  it("parses rights/form/keys, computes the matrix and report flag, reads attribution.txt when served", async () => {
    const d = await SongPackageHelper.detail(row(), URLS, { contributors: [{ name: "Ada", what: "correction" }], readText: async (name) => `served ${name}\n` });
    expect(d.rights).toEqual({ text: { license: "PD" }, translation: null, tune: { license: "PD" }, arrangement: null, recording: null, artwork: null });
    expect(d.rightsMatrix.arrange).toEqual({ allowed: true, conditions: [] });
    expect(d.ccliReport).toBe(false);
    expect(d.attribution).toBe("served attribution.txt");
    expect(d.form).toEqual({ status: "draft", sections: [{ label: "Verse 1", lyric: 1 }], defaultOrder: ["Verse 1"] });
    expect(d.publishedKeys).toEqual(["G", "F"]);
    expect(d.listenedKeys).toEqual([]);
    expect(d.contributors).toEqual([{ name: "Ada", what: "correction" }]);
    expect(d).toMatchObject({ scoreSource: "abc", recommendedKeyReason: null, sundayReadyAt: null, sundayReadyBy: null });
    for (const k of ["qualityScore", "qualityDetail", "proAnswer", "submittedBy", "portraitKey"]) expect(d).not.toHaveProperty(k);
  });

  it("falls back to the asset license and a notice line when the package recorded nothing", async () => {
    const d = await SongPackageHelper.detail({ ...row(), rights: null, form: null, publishedKeys: null, license: "WC", licenseVersion: "1.0" }, {}, {});
    expect(d.rights).toBeNull();
    expect(d.rightsMatrix.stream.conditions).toEqual(["Not monetized: no ads, paid downloads, or ticketed streams"]);
    expect(d.attribution).toBe("John Newton, 1779. WorshipCommons License 1.0: free for worship use; not to be monetized.");
    expect(d.publishedKeys).toEqual(["G"]);
    expect(d.form).toBeNull();
    expect(d.contributors).toEqual([]);
  });

  it("serialises the listen-gate record", async () => {
    const d = await SongPackageHelper.detail({ ...row(), confidence: "sunday-ready", listenedKeys: JSON.stringify(["G", "F"]), sundayReadyBy: "admin000001", sundayReadyAt: new Date("2026-09-07T10:00:00Z") }, URLS);
    expect(d).toMatchObject({ sundayReady: true, listenedKeys: ["G", "F"], sundayReadyBy: "admin000001", sundayReadyAt: "2026-09-07T10:00:00.000Z" });
  });
});

describe("SongPackageHelper.family and similar", () => {
  const rows: any[] = [
    { id: "root", parentSongId: null, language: "English", meter: "8.7.8.7 D", scripture: "Ps 46:1", themes: "Trust,Refuge" },
    { id: "kid1", parentSongId: "root", language: "German", meter: "8.7.8.7 D", scripture: "Ps 46:1", themes: "Trust" },
    { id: "kid2", parentSongId: "root", language: "English", meter: null, scripture: null, themes: "" },
    { id: "meterMate", parentSongId: null, language: "English", meter: "8.7.8.7D", scripture: "Ps 46:1-3", themes: "Refuge,Trust", rank: 50 },
    { id: "themeMate", parentSongId: null, language: "English", meter: "CM", scripture: "Rom 8", themes: "Trust", rank: 90 },
    { id: "otherLang", parentSongId: null, language: "Spanish", meter: "8.7.8.7 D", scripture: "Ps 46:1", themes: "Trust,Refuge" },
    { id: "nothing", parentSongId: null, language: "English", meter: "LM", scripture: "John 3:16", themes: "Kids" }
  ];

  it("family is parent + siblings + children, root first, never the song itself", () => {
    expect(SongPackageHelper.family(rows[1], rows).map((r) => r.id)).toEqual(["root", "kid2"]);
    expect(SongPackageHelper.family(rows[0], rows).map((r) => r.id)).toEqual(["kid1", "kid2"]);
  });

  it("similar scores meter, scripture book and themes within the language, excludes family, and explains itself", () => {
    const summaries = rows.map((r) => SongPackageHelper.summary(r, {}));
    const hits = SongPackageHelper.similar(rows[0], summaries, new Set(["kid1", "kid2"]));
    expect(hits.map((h) => [h.id, h.reason])).toEqual([
      ["meterMate", "Same meter (8.7.8.7D), scripture from Ps and themes Refuge, Trust."],
      ["themeMate", "Theme Trust."]
    ]);
    // without the family exclusion kid1 is still out (German) and kid2 scores nothing; the limit trims the rest
    expect(SongPackageHelper.similar(rows[0], summaries, new Set(), 1).map((h) => h.id)).toEqual(["meterMate"]);
  });
});
