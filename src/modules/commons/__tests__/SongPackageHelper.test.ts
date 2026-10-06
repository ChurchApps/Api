import { SongPackageHelper } from "../helpers/SongPackageHelper";
import { sectionLabel } from "../helpers/DuplicateHelper";

const CHART = "{title: Amazing Grace}\n{key: G}\n\nVerse 1\n[G]Amazing   grace! how [C]sweet the [G]sound,\nthat saved a wretch like [D]me!\n\nChorus\nPraise [G]God";

describe("SongPackageHelper text readers", () => {
  it("firstLine skips directives and stanza labels, strips chords and collapses whitespace", () => {
    expect(SongPackageHelper.firstLine(CHART)).toBe("Amazing grace! how sweet the sound,");
    expect(SongPackageHelper.firstLine("Verse 1\nAch bleib mit deiner Gnade\nBei uns")).toBe("Ach bleib mit deiner Gnade");
    expect(SongPackageHelper.firstLine("")).toBeNull();
    expect(SongPackageHelper.firstLine(undefined)).toBeNull();
    // writers chart sections in parentheses; "(Intro)" over a chord line is not the first sung line
    expect(SongPackageHelper.firstLine("(Intro)\n[A] [D] [A]\n\n(Verse 1)\n[A]We won't go, if You're not with us")).toBe("We won't go, if You're not with us");
  });

  it("reads parenthesised stanza labels by the text inside and never turns a sung line into a section", () => {
    expect(sectionLabel("(Chorus x2)")).toBe("Chorus x2");
    expect(sectionLabel("(Intro/Instrumental)")).toBe("Intro/Instrumental");
    expect(sectionLabel("Verse 2")).toBe("Verse 2");
    expect(sectionLabel("[G](Hallelujah)")).toBeNull();
    expect(sectionLabel("[G]When the [D]music [A]fades")).toBeNull();
    const byOurSide = "(Verse 1)\n[A]We won't go\n\n(Bridge)\n[G / D / A / Bm]\n\n[G]When the [D]music [A]fades   Still [Bm]by our side\n\n(Chorus x2)\n[G]Your love is constant";
    expect(SongPackageHelper.draftForm(byOurSide)?.defaultOrder).toEqual(["Verse 1", "Bridge", "Chorus x2"]);
  });

  it("reads {c: …} comments, trailing colons and a number run onto the heading as labels", () => {
    expect(sectionLabel("{c: Intro}")).toBe("Intro");
    expect(sectionLabel("{comment: Chorus}")).toBe("Chorus");
    expect(sectionLabel("{title: Lord on High}")).toBeNull();
    expect(sectionLabel("Chorus3:")).toBe("Chorus3");
    expect(sectionLabel("Verse 1:")).toBe("Verse 1");
    expect(sectionLabel("CHORUS: (2x)")).toBe("CHORUS (2x)");
    expect(sectionLabel("Versed in love")).toBeNull();
    expect(sectionLabel("Verse 1,")).toBe("Verse 1");
    expect(SongPackageHelper.firstLine("{c: Intro}\n[F] [C]\n\n{c: Chorus}\nI’m gonna [F]pra[C]ise [F]You,")).toBe("I’m gonna praise You,");
    expect(SongPackageHelper.draftForm("{c: Intro}\n[F] [C]\n\n{c: Chorus}\nI’m gonna praise\n\nChorus3:\nGod of peace")?.defaultOrder).toEqual(["Intro", "Chorus", "Chorus3"]);
  });

  it("splits a writer credit into the people it names", () => {
    expect(SongPackageHelper.writerNames("Words by Joy Marquéz • Music by Doug Gregan")).toEqual(["Joy Marquéz", "Doug Gregan"]);
    expect(SongPackageHelper.writerNames("Wendell Salumbides, Jessa Bonita & Joycey de Leon")).toEqual(["Wendell Salumbides", "Jessa Bonita", "Joycey de Leon"]);
    expect(SongPackageHelper.writerNames("Words and music by Ann Lee")).toEqual(["Ann Lee"]);
    expect(SongPackageHelper.writerNames("Johann Bach and Anand Band")).toEqual(["Johann Bach", "Anand Band"]);
  });

  it("turns a chords-over-lyrics chart into inline ChordPro", () => {
    // monospaced: each chord lands on the word under its column
    expect(SongPackageHelper.inlineChordLines("    G          C        G\nAmazing grace, how sweet the sound")).toBe("[G]Amazing grace, [C]how [G]sweet the sound");
    // a proportional-font paste leaves the chord row wider than the words: columns scale, trailing periods drop
    const pasted = SongPackageHelper.inlineChordLines("                                                              Am.   Gsus   C\nPraise God from whom all  bless-ings flow");
    expect(pasted).toBe("Praise God from whom all  [Am]bless-ings [Gsus] [C]flow");
    // a progression with bar lines, or a chord row with no words under it, keeps its place and brackets its chords
    expect(SongPackageHelper.inlineChordLines("Intro\nF  |  Gsus  |  C\nPraise Him")).toBe("Intro\n[F] [Gsus] [C]\nPraise Him");
    expect(SongPackageHelper.inlineChordLines("Intro\nC\n\nVerse 1")).toBe("Intro\n[C]\n\nVerse 1");
    // lyrics that merely contain chord-like words, and ChordPro already inline, are untouched
    expect(SongPackageHelper.inlineChordLines("A Mighty Fortress\n[G]Holy, [C]holy")).toBe("A Mighty Fortress\n[G]Holy, [C]holy");
    expect(SongPackageHelper.firstLine(SongPackageHelper.inlineChordLines("Intro\nC\n\nVerse 1\n   Am   C\nPraise God from whom"))).toBe("Praise God from whom");
  });

  it("tidies paste artifacts: double spacing, bracketed notes, copyright lines", () => {
    expect(SongPackageHelper.tidyPaste("Line one\n\nLine two\n \n\n\nChorus one\n\nChorus two")).toBe("Line one\nLine two\n\nChorus one\nChorus two");
    // normal stanzas keep their spacing
    expect(SongPackageHelper.tidyPaste("A\nB\n\n\nC")).toBe("A\nB\n\n\nC");
    expect(SongPackageHelper.tidyPaste("[Bb]all of my [F]heart.\n\n[Flute Solo]\n\n[F]  [C]\n[Eb]\n\n[©1994 LAMPSongs - Words & Music by X]")).toBe("[Bb]all of my [F]heart.\n\n{c: Flute Solo}\n\n[F]  [C]\n[Eb]\n");
  });

  it("reads [2x] as a repeat mark and splits a heading with no blank line above it", () => {
    expect(SongPackageHelper.tidyPaste("[C]The Great I Am [2x]\n[Am] [F] [2x]")).toBe("[C]The Great I Am (2x)\n[Am] [F] (2x)");
    const run = "Verse 1,\n  [E]You share my grief\n  [E]Companions on the road\nChorus\n  Didn't our hearts\nVerse 2\n  [E]You change my heart";
    expect(SongPackageHelper.draftForm(SongPackageHelper.tidyPaste(run))?.defaultOrder).toEqual(["Verse 1", "Chorus", "Verse 2"]);
    // a lyric that opens on a heading word, or a heading right under another, stays where it is
    expect(SongPackageHelper.tidyPaste("[G]Down by the river\nBridge of sighs we cross\nIntro\nVerse 1\nWords")).toBe("[G]Down by the river\nBridge of sighs we cross\n\nIntro\nVerse 1\nWords");
  });

  it("splits a heading from the chords on its line and capitalises a lowercase slash bass", () => {
    expect(SongPackageHelper.tidyPaste("Intro: [G] [D] - [C/a] [G]\n\nVerse:\n[C2]Father of [D/G   G]lights")).toBe("{c: Intro}\n[G] [D] [C/A] [G]\n\nVerse:\n[C2]Father of [D/G   G]lights");
    expect(SongPackageHelper.tidyPaste("TAG OUT: (2x)   E/g#  A  B  E")).toBe("{c: TAG OUT (2x)}\n[E/G#] [A] [B] [E]");
    expect(SongPackageHelper.tidyPaste("INTRO:  E  B – (C#m) (Bsus/e  E) | A")).toBe("{c: INTRO}\n[E] [B] [C#m] [Bsus/E] [E] [A]");
    expect(SongPackageHelper.tidyPaste("[C/a]Grace and [Bsus/e E]love")).toBe("[C/A]Grace and [Bsus/E E]love");
    // run on from a lyric, it still starts its own stanza, and the form map names it
    const chart = SongPackageHelper.tidyPaste("Bridge:\n[A]Father of life\nSolo: D D/E- E | Bm7 E");
    expect(chart).toBe("Bridge:\n[A]Father of life\n\n{c: Solo}\n[D] [D/E] [E] [Bm7] [E]");
    expect(SongPackageHelper.draftForm(chart)?.defaultOrder).toEqual(["Bridge", "Solo"]);
    // words after the colon are a sung line
    expect(SongPackageHelper.tidyPaste("Chorus: Amazing grace")).toBe("Chorus: Amazing grace");
    // the heading in brackets of its own
    expect(SongPackageHelper.tidyPaste("[Intro:]  [D - D] | [D/G - D/G]\n{c: Verse: (2x)}")).toBe("{c: Intro}\n[D] [D] [D/G] [D/G]\n\n{c: Verse: (2x)}");
    expect(SongPackageHelper.tidyPaste("[Solo:] [D - D/G] | [D- D/G]")).toBe("{c: Solo}\n[D] [D/G] [D] [D/G]");
    // a {c:} label straight under a chord line starts its own stanza, so the form map keeps it
    const solo = SongPackageHelper.tidyPaste("{c: Bridge:}\n[D]How beautiful\n\n[Solo:] [D - D/G]\n{c: Verse:}\n\nAt Your [Bm]voice");
    expect(SongPackageHelper.draftForm(solo)?.defaultOrder).toEqual(["Bridge", "Solo", "Verse"]);
  });

  it("spreads a chord row typed inside one bracket over the words after it", () => {
    expect(SongPackageHelper.inlineChordLines("[C                     Emaj] To live amongst us")).toBe("[C]To live [Emaj]amongst us");
    expect(SongPackageHelper.inlineChordLines("[Emaj       Amin]Oh Emmanuel")).toBe("[Emaj]Oh [Amin]Emmanuel");
    // a single-spaced pair stays one bracket
    expect(SongPackageHelper.inlineChordLines("[Am7 - C2]Holy")).toBe("[Am7 - C2]Holy");
    // indentation goes once chord rows are placed
    expect(SongPackageHelper.inlineChordLines("Chorus\n\tDidn't [C#m]our hearts\n        [E]You spoke")).toBe("Chorus\nDidn't [C#m]our hearts\n[E]You spoke");
    // "(2x)" after a chord-only intro is not the first line
    expect(SongPackageHelper.firstLine("{c: Intro}\n[Am] [F] (2x)\n\n{c: Verse 1}\n[Am]He was conceived")).toBe("He was conceived");
  });

  it("drops a first line that only repeats the title", () => {
    expect(SongPackageHelper.dropTitleLine("LORD ON HIGH\n\nVERSE 1:\nWhom have I", "Lord on High")).toBe("VERSE 1:\nWhom have I");
    expect(SongPackageHelper.dropTitleLine("Lord on high You are everlasting", "Lord on High")).toBe("Lord on high You are everlasting");
    expect(SongPackageHelper.dropTitleLine("{c: WINGS OF THE WIND}\n\n{c: Verse}\n[D]Oh Lord my God", "Wings of the Wind")).toBe("{c: Verse}\n[D]Oh Lord my God");
    expect(SongPackageHelper.dropTitleLine("{c: Chorus}\n[D]Wings of the wind", "Wings of the Wind")).toBe("{c: Chorus}\n[D]Wings of the wind");
  });

  it("drops a credit and scripture preamble, and only that, from the top", () => {
    const ref = "2 Cor. 3; Col. 1";
    expect(SongPackageHelper.dropPreamble("By Amy Denson\nScripture references: \n2 Cor. 3; Col. 1\n\n{c: Verse 1}\n\n[D]Father", "Amy Denson", ref)).toBe("{c: Verse 1}\n\n[D]Father");
    expect(SongPackageHelper.dropPreamble("(Matt Burmeister, Braylen Burmeister 2026)\n\nIntro  E  E4\n\nVerse 1", "Matt Burmeister", null)).toBe("Intro  E  E4\n\nVerse 1");
    expect(SongPackageHelper.dropPreamble("By Amy Denson\n\nScripture Reference: Psalm 69\n\n\n{c: Verse 1}", "Amy Denson", "Psalm 69")).toBe("{c: Verse 1}");
    // a sung first line stays, and so does anything after it
    expect(SongPackageHelper.dropPreamble("By the waters of Babylon\nBy Amy Denson", "Amy Denson", null)).toBe("By the waters of Babylon\nBy Amy Denson");
  });

  it("closes up a double-spaced chart that {c:} labels, whatever its gaps", () => {
    const chart = "{c: Verse 1}\n\n\nMay [C]Your salvation\n\n\nFor [C]You have heard\n\n\n\n{c: Chorus}\n\nYou who seek\n\n\nAnd praise the name\n\n\n{c: Verse 2}\n\n\nFor [C]God will save";
    expect(SongPackageHelper.tidyPaste(chart)).toBe("{c: Verse 1}\nMay [C]Your salvation\nFor [C]You have heard\n\n{c: Chorus}\nYou who seek\nAnd praise the name\n\n{c: Verse 2}\nFor [C]God will save");
    // an outro typed single-spaced, and a section of real stanzas, stay as typed
    const mixed = "{c: Verse 1}\n\n[D]Father look down\n\n[D]May we find favor\n\n\n{c: Chorus}\nOne\nTwo\n\nThree\nFour\n\n{c: Outro}\n\nAdonai, reign\nOh Adonai\n";
    expect(SongPackageHelper.tidyPaste(mixed)).toBe("{c: Verse 1}\n[D]Father look down\n[D]May we find favor\n\n{c: Chorus}\nOne\nTwo\n\nThree\nFour\n\n{c: Outro}\n\nAdonai, reign\nOh Adonai\n");
  });

  it("takes the first line with words, past vocalise over the intro", () => {
    expect(SongPackageHelper.firstLine("INTRO\n[Cmaj7]  Ooh,  [A7sus2]    ooh\n\nVERSE 1\n[Cmaj7] Restore my soul")).toBe("Restore my soul");
    expect(SongPackageHelper.firstLine("Oh Lord my God")).toBe("Oh Lord my God");
  });

  it("reads a colon-less instrumental heading, bracket-edge spaces, and a cue in brackets after the words", () => {
    expect(SongPackageHelper.tidyPaste("Intro  E  E4  E  E4")).toBe("{c: Intro}\n[E] [E4] [E] [E4]");
    expect(SongPackageHelper.tidyPaste("Verse 1")).toBe("Verse 1");
    expect(SongPackageHelper.tidyPaste("[ A7sus2] And take control\n[F ]  Ooh")).toBe("[A7sus2] And take control\n[F]  Ooh");
    expect(SongPackageHelper.tidyPaste("And praise the name of [G] Jesus with [A] song [Ends on A Major]")).toBe("And praise the name of [G] Jesus with [A] song\n(Ends on A Major)");
    // chord pairs and odd chord spellings at a line's end stay chords
    expect(SongPackageHelper.tidyPaste("within our [Es4 E] hearts [G - D/F# - G/E]")).toBe("within our [Es4 E] hearts [G - D/F# - G/E]");
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
    expect(SongPackageHelper.baseConfidence({ hasScore: true, scoreSource: "master", hasChords: true })).toBe("score");
    expect(SongPackageHelper.baseConfidence({ hasScore: true, scoreSource: "abc", hasChords: false })).toBe("score");
    expect(SongPackageHelper.baseConfidence({ hasScore: true, scoreSource: "midi", hasChords: false })).toBe("generated-from-midi");
    expect(SongPackageHelper.baseConfidence({ hasScore: false, scoreSource: "abc", hasChords: true })).toBe("chart-only");
    expect(SongPackageHelper.baseConfidence({ hasScore: false, hasChords: false })).toBe("lyrics-only");
    expect(SongPackageHelper.normalizeConfidence("proofread-score")).toBe("score");
    expect(SongPackageHelper.normalizeConfidence("converted-from-abc")).toBe("score");
    expect(SongPackageHelper.normalizeConfidence("sunday-ready")).toBe("sunday-ready");
  });
});

const row = (): any => ({
  id: "song0000001",
  title: "Amazing Grace",
  writer: "John Newton",
  year: 1779,
  language: "English",
  license: "PD",
  licenseVersion: null,
  status: "published",
  themes: "Grace,Salvation",
  meter: "CM",
  scripture: "Eph 2:8",
  songKey: "G",
  hymnalCount: 1200,
  rank: 70,
  portraitKey: "commons/writers/n.jpg",
  qualityScore: 88,
  qualityDetail: "{}",
  proAnswer: "no",
  submittedBy: "u1",
  confidence: "converted-from-abc",
  firstLine: "Amazing grace! how sweet the sound,",
  tune: null,
  hasChords: 1,
  featured: 1,
  recommendedKey: null,
  singTimeSeconds: 150,
  rights: JSON.stringify({ text: { license: "PD" }, tune: { license: "PD" }, arrangement: null, recording: null, artwork: null }),
  form: JSON.stringify({ status: "draft", sections: [{ label: "Verse 1", lyric: 1 }], defaultOrder: ["Verse 1"] }),
  publishedKeys: JSON.stringify(["G", "F"]),
  listenedKeys: null,
  scoreSource: "abc",
  recommendedKeyReason: null,
  sundayReadyBy: null,
  sundayReadyAt: null
});
const URLS = { score: "u/score.musicxml", slides: "u/slides.json", timing: "u/timing.json", attribution: "u/attribution.txt" };

const pack = (id: string, slug: string) => `https://content.churchapps.org/commons/songs/en/${slug}-${id}`;

describe("SongPackageHelper.listRow", () => {
  it("keeps library fields and replaces package URLs with a directory and booleans", () => {
    const id = "song0000001";
    const base = pack(id, "amazing-grace");
    const full = SongPackageHelper.summary({
      ...row(),
      writerBio: "A paragraph copied onto every song by this writer.",
      licenseUrl: "https://example.com/license",
      timeSignature: "3/4",
      relationLabel: "Translation"
    }, {
      chart: `${base}/output/composition/chart.chordpro`,
      score: `${base}/output/composition/score.musicxml`,
      attribution: `${base}/output/composition/attribution.txt`,
      song: `${base}/song.json`,
      thumb: `${base}/output/composition/cover-thumb.webp`,
      cover: `${base}/sources/cover.webp`,
      portrait: "https://content.churchapps.org/commons/writers/john-newton/portrait.jpg",
      midi: `${base}/sources/tune.mid`,
      demoAudio: `${base}/sources/master/song.mp3`,
      "Amazing Grace-pack": `${base}/output/audio/Amazing-Grace.zip`
    });
    const list = SongPackageHelper.listRow(full);
    expect(list).toMatchObject({
      title: full.title,
      firstLine: full.firstLine,
      hasScore: true,
      confidence: "score",
      rank: 70,
      packageDir: "songs/en/amazing-grace-song0000001",
      hasCover: true,
      hasMidi: true,
      hasDemo: true,
      hasStems: true,
      portrait: "writers/john-newton/portrait.jpg"
    });
    expect(list).not.toHaveProperty("fileUrls");
    expect(list).not.toHaveProperty("coverOnParent");
    expect(list).not.toHaveProperty("writerBio");
    expect(list).not.toHaveProperty("licenseUrl");
    expect(list).not.toHaveProperty("timeSignature");
    expect(list).not.toHaveProperty("recommendedKey");
    expect(list).not.toHaveProperty("singTimeSeconds");
    expect(list).not.toHaveProperty("tune");
  });

  it("points a borrowed cover at the parent and keeps this song's own melody directory", () => {
    const child = "child0000001";
    const parent = "song0000001";
    const own = pack(child, "cariñoso-salvador");
    const borrowed = pack(parent, "jesus-lover-of-my-soul");
    const list = SongPackageHelper.listRow(SongPackageHelper.summary({ ...row(), id: child, parentSongId: parent }, {
      cover: `${borrowed}/sources/cover.webp`,
      thumb: `${borrowed}/output/composition/cover-thumb.webp`,
      midi: `${own}/sources/tune.mid`
    }));
    expect(list).toMatchObject({
      packageDir: "songs/en/cariñoso-salvador-child0000001",
      hasCover: true,
      coverOnParent: true,
      hasMidi: true
    });
    expect(list).not.toHaveProperty("midiOnParent");
    expect(list).not.toHaveProperty("fileUrls");
  });
});

describe("SongPackageHelper.summary", () => {
  it("adds the contract booleans from the served files and drops the reviewer-only columns", () => {
    const s = SongPackageHelper.summary(row(), URLS);
    expect(s).toMatchObject({ confidence: "score", sundayReady: false, featured: true, firstLine: "Amazing grace! how sweet the sound,", tune: null, hymnalCount: 1200, hasChords: true, hasScore: true, hasSlides: true, hasTiming: true, hasAccompaniment: false, recommendedKey: null, singTimeSeconds: 150, rank: 70 });
    expect(s).not.toHaveProperty("qualityScore");
    expect(s).not.toHaveProperty("portraitKey");
    expect(s).not.toHaveProperty("ratingCount");
    expect(s).not.toHaveProperty("ratingSum");
    expect(SongPackageHelper.summary({ ...row(), confidence: "sunday-ready" }, {})).toMatchObject({ sundayReady: true, hasScore: false, hasSlides: false, hasTiming: false });
    expect(SongPackageHelper.summary(row(), { ...URLS, instrumental: "u/instrumental.m4a" }).hasAccompaniment).toBe(true);
    expect(SongPackageHelper.summary(row(), { ...URLS, stemsZip: "u/pack.zip" }).hasAccompaniment).toBe(true);
    expect(SongPackageHelper.summary(row(), { ...URLS, demoAudio: "u/demo.mp3" }).hasAccompaniment).toBe(false);
    expect(SongPackageHelper.summary(row(), { abc: "u/tune.abc", slides: "u/slides.json" })).toMatchObject({ hasScore: true, hasSlides: true });
    expect(SongPackageHelper.summary(row(), { midi: "u/tune.mid", slides: "u/slides.json" }).hasScore).toBe(false);
  });
});

describe("SongPackageHelper.detail", () => {
  it("parses rights/form/keys, computes the matrix and report flag, reads attribution.txt when served", async () => {
    const d = await SongPackageHelper.detail({ ...row(), contributors: JSON.stringify([{ name: "Ada", what: "correction" }]) }, URLS, { readText: async (name) => `served ${name}\n` });
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

describe("Nashville charts and short labels", () => {
  it("spells an all-number chart as letters in the song's key", () => {
    expect(SongPackageHelper.letterChords("I [4]stand [5]at [1/3]Christ [6m]home [b7sus] [4 - 5]", "Ab")).toBe("I [Db]stand [Eb]at [Ab/C]Christ [Fm]home [Gbsus] [Db - Eb]");
    expect(SongPackageHelper.letterChords("[4]x [1/3]y", "G")).toBe("[C]x [G/B]y");
  });
  it("leaves a lettered or mixed chart, or one with no key, alone", () => {
    expect(SongPackageHelper.letterChords("[G]x [4]y", "G")).toBe("[G]x [4]y");
    expect(SongPackageHelper.letterChords("[4]x", "")).toBe("[4]x");
  });
  it("reads a bare PRE as the pre-chorus, never a word that starts with pre", () => {
    expect(["PRE", "Pre 2:", "Precious Lord", "Pre-ordained love"].map(sectionLabel)).toEqual(["PRE", "Pre 2", null, null]);
  });
});
