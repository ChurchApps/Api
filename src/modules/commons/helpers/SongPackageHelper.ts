import { Confidence, Contributor, FormMap, RightsLayer, RightsMap, RightsMatrix, SongView } from "../models/index.js";
import { parseContributors } from "./ContributorsHelper.js";
import { DuplicateHelper, sectionLabel } from "./DuplicateHelper.js";
import { RightsHelper } from "./RightsHelper.js";

// The package model on the read side: how a songs row plus its served files becomes the summary and
// detail payloads of the contract (confidence tier, has* flags, rights matrix, form map, similar
// songs). Pure — storage and repos stay in the controllers so this is unit-testable without mocks.

const CHORD = /\[[A-G][#b]?[^\]]*\]/;
const RIGHTS_LAYERS = ["text", "translation", "tune", "arrangement", "recording", "artwork"] as const;
const SIMILAR_LIMIT = 6;
const LIST_AUDIO = /\.(mp3|m4a|wav|ogg|flac)(\?|#|$)/i;
const LIST_STEMS_ZIP = /\/output\/audio\/[^/?#]+\.zip(\?|#|$)/i;
const LIST_PACKAGE = /\/commons\/(songs\/[^/]+\/[^/]+)\//;
const LIST_FIELDS = [
  "id",
  "title",
  "writer",
  "year",
  "themes",
  "language",
  "license",
  "downloadCount",
  "saveCount",
  "createdAt",
  "publishedAt",
  "songKey",
  "bpm",
  "meter",
  "scripture",
  "hymnalCount",
  "parentSongId",
  "firstLine",
  "tune",
  "confidence",
  "sundayReady",
  "hasChords",
  "hasScore",
  "hasSlides",
  "hasAccompaniment",
  "rank"
] as const;

export interface SongSummary extends SongView {
  confidence: Confidence | null;
  sundayReady: boolean;
  featured: boolean;
  firstLine: string | null;
  tune: string | null;
  hymnalCount: number;
  hasChords: boolean;
  hasScore: boolean;
  hasSlides: boolean;
  hasTiming: boolean;
  hasAccompaniment: boolean;
  recommendedKey: string | null;
  singTimeSeconds: number | null;
  fileUrls: Record<string, string>;
  /** List only: commons-relative package directory, when this song has its own files. */
  packageDir?: string;
  hasCover?: boolean;
  hasMidi?: boolean;
  hasDemo?: boolean;
  hasStems?: boolean;
  coverOnParent?: boolean;
  midiOnParent?: boolean;
  /** List only: writers/.../portrait.jpg, relative to the content root. */
  portrait?: string;
}

export interface SongDetail extends Omit<SongSummary, "rights" | "form" | "publishedKeys" | "listenedKeys" | "sundayReadyAt" | "contributors"> {
  rights: RightsMap | null;
  rightsMatrix: RightsMatrix;
  ccliReport: boolean;
  attribution: string;
  form: FormMap | null;
  publishedKeys: string[];
  recommendedKeyReason: string | null;
  scoreSource: string | null;
  contributors: Contributor[];
  sundayReadyAt: string | null;
  sundayReadyBy: string | null;
  listenedKeys: string[];
}

export interface SimilarSong extends SongSummary { reason: string; }

export class SongPackageHelper {
  /** First sung line: past {directives} and stanza labels, [chords] stripped, whitespace collapsed. */
  static firstLine(chordPro: string | null | undefined): string | null {
    const line = DuplicateHelper.firstLine(chordPro || "").replace(/\s+/g, " ").trim();
    return line ? line.slice(0, 255) : null;
  }

  static hasChords(chordPro: string | null | undefined): boolean {
    return CHORD.test(chordPro || "");
  }

  /**
   * Draft form map from the stanza labels: a blank-line-separated stanza counts when its first line is a label
   * (DuplicateHelper.sectionLabel). One that opens on a sung line adds no section — never a lyric as a section name.
   */
  static draftForm(chordPro: string | null | undefined): FormMap | null {
    const labels: string[] = [];
    for (const stanza of (chordPro || "").split(/\r?\n\s*\r?\n/)) {
      // a {c: Chorus} comment labels its stanza; any other {directive} is skipped
      const first = stanza.split(/\r?\n/).map((l) => l.trim()).find((l) => l && (!l.startsWith("{") || sectionLabel(l)));
      const label = first && sectionLabel(first);
      if (label) labels.push(label.slice(0, 40));
    }
    if (!labels.length) return null;
    return { status: "draft", sections: labels.map((label, i) => ({ label, lyric: i + 1 })), defaultOrder: labels };
  }

  /** Pasted lyrics often open with the title again ("LORD ON HIGH"): drop that line, it is not sung. */
  static dropTitleLine(chordPro: string, title: string | null | undefined): string {
    const fold = (s: string) => s.replace(/\[[^\]]*\]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    const lines = chordPro.split("\n");
    const i = lines.findIndex((l) => l.trim() && !l.trim().startsWith("{"));
    if (i < 0 || !fold(title || "") || fold(lines[i]) !== fold(title || "")) return chordPro;
    lines.splice(i, 1);
    return lines.join("\n").replace(/^\n+/, "");
  }

  /** "Words by Joy Marquéz • Music by Doug Gregan", "A, B & C", "Ann and Bo": the people a writer credit names. */
  static writerNames(writer: string): string[] {
    return writer.replace(/\b(?:(?:words|lyrics|music|text|tune)(?:\s*(?:and|&)\s*(?:words|lyrics|music))?|arranged|arrangement|translated)\s+by\b\s*:?/gi, "|")
      .split(/\s*(?:[|,&•·/;]|\band\b)\s*/i).map((n) => n.trim()).filter(Boolean);
  }

  /** Stored rows may still say proofread-score / converted-from-abc until the remap migration runs. */
  static normalizeConfidence(c?: string | null): Confidence | null {
    if (!c) return null;
    if (c === "proofread-score" || c === "converted-from-abc") return "score";
    return c as Confidence;
  }

  /** The tier a package earns from its files alone; "sunday-ready" is only ever granted by the listen gate.
   *  ABC conversion is a typeset score (Open Hymnal SATB), same as an uploaded MusicXML master. MIDI is the sketch. */
  static baseConfidence(p: { hasScore: boolean; scoreSource?: string | null; hasChords: boolean }): Confidence {
    if (p.hasScore) return p.scoreSource === "midi" ? "generated-from-midi" : "score";
    return p.hasChords ? "chart-only" : "lyrics-only";
  }

  static parseJson<T>(v: unknown): T | null {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v !== "string") return v as T;
    try { return JSON.parse(v) as T; } catch { return null; }
  }

  static parseKeys(v: unknown): string[] {
    const keys = this.parseJson<unknown>(v);
    return Array.isArray(keys) ? keys.filter((k): k is string => typeof k === "string") : [];
  }

  /** Every layer present with `translation` null today; null when the package recorded no rights. */
  static normalizeRights(v: unknown): RightsMap | null {
    const raw = this.parseJson<Record<string, RightsLayer | null>>(v);
    if (!raw || typeof raw !== "object") return null;
    const out = {} as RightsMap;
    for (const k of RIGHTS_LAYERS) out[k] = raw[k] && typeof raw[k] === "object" && raw[k].license ? raw[k] : null;
    return out;
  }

  /** Summary row: the joined row with the new booleans, reviewer-only fields dropped, has* read off the served files. */
  static summary(row: SongView, fileUrls: Record<string, string>): SongSummary {
    const { portraitKey: _portraitKey, qualityScore: _qualityScore, ratingCount: _ratingCount, ratingSum: _ratingSum, ...rest } = row as SongView & { portraitKey?: string };
    const confidence = this.normalizeConfidence(row.confidence);
    return {
      ...rest,
      confidence,
      sundayReady: confidence === "sunday-ready",
      featured: !!row.featured,
      firstLine: row.firstLine || null,
      tune: row.tune || null,
      hymnalCount: row.hymnalCount || 0,
      hasChords: !!row.hasChords,
      // Open Hymnal ABC is a typeset SATB score; generated MusicXML is often gitignored and never lands in fileUrls
      hasScore: !!(fileUrls.score || fileUrls.abc),
      hasSlides: !!fileUrls.slides,
      hasTiming: !!fileUrls.timing,
      hasAccompaniment: !!(fileUrls.instrumental || fileUrls.stemsZip),
      recommendedKey: row.recommendedKey || null,
      singTimeSeconds: row.singTimeSeconds ?? null,
      fileUrls
    };
  }

  // GET /songs is one row per published song. Cover, thumbnail, melody, and demo
  // sit at fixed names inside a package directory. The directory is not always
  // slug(title), and a translation often uses its parent's. The row carries the
  // directory plus booleans. Charts, scores, and the stems filename stay on the song page.
  static listRow(row: SongSummary): SongSummary {
    const out: Partial<SongSummary> = {};
    for (const key of LIST_FIELDS) {
      const value = row[key];
      if (value !== undefined && value !== null && value !== "") out[key] = value as never;
    }
    const files = row.fileUrls || {};
    const ownId = row.id || "";
    const dirOf = (url?: string) => (url && url.match(LIST_PACKAGE)?.[1]) || "";
    const owns = (dir: string) => !!ownId && dir.endsWith(`-${ownId}`);
    const coverDir = dirOf(files.cover || files.art || files.thumb);
    const midiDir = dirOf(files.midi);
    const demoUrl = files.demoAudio || files.master || (LIST_AUDIO.test(files.song || "") ? files.song : "");
    const demoDir = dirOf(demoUrl);
    const ownDir = [coverDir, midiDir, demoDir].find(owns) || "";
    if (ownDir) out.packageDir = ownDir;
    if (coverDir) {
      out.hasCover = true;
      if (!owns(coverDir)) out.coverOnParent = true;
    }
    if (midiDir) {
      out.hasMidi = true;
      if (!owns(midiDir)) out.midiOnParent = true;
    }
    if (demoDir) out.hasDemo = true;
    if (Object.entries(files).some(([key, url]) => key === "stemsZip" || LIST_STEMS_ZIP.test(url || ""))) out.hasStems = true;
    const portrait = files.portrait || "";
    const writersAt = portrait.indexOf("writers/");
    if (writersAt >= 0) out.portrait = portrait.slice(writersAt);
    return out as SongSummary;
  }

  /** Detail row: summary plus the parsed rights/form/keys, the computed matrix, and the attribution text. */
  static async detail(row: SongView, fileUrls: Record<string, string>, opts: { readText?: (name: string) => Promise<string | null> } = {}): Promise<SongDetail> {
    const { proAnswer: _proAnswer, qualityDetail: _qualityDetail, submittedBy: _submittedBy, ...pub } = this.summary(row, fileUrls) as SongSummary & { qualityDetail?: string };
    const rights = this.normalizeRights(row.rights);
    const layers = rights ? Object.values(rights) : [];
    const served = fileUrls.attribution && opts.readText ? (await opts.readText("attribution.txt"))?.trim() : null;
    const publishedKeys = this.parseKeys(row.publishedKeys);
    return {
      ...pub,
      rights,
      rightsMatrix: RightsHelper.composeMatrix(layers, row.license),
      ccliReport: RightsHelper.ccliReport(layers, row.license),
      attribution: served || this.noticeLine(row),
      form: this.parseJson<FormMap>(row.form),
      publishedKeys: publishedKeys.length ? publishedKeys : row.songKey ? [row.songKey] : [],
      recommendedKeyReason: row.recommendedKeyReason || null,
      scoreSource: row.scoreSource || null,
      contributors: parseContributors(row.contributors),
      sundayReadyAt: row.sundayReadyAt ? new Date(row.sundayReadyAt).toISOString() : null,
      sundayReadyBy: row.sundayReadyBy || null,
      listenedKeys: this.parseKeys(row.listenedKeys)
    };
  }

  static noticeLine(row: SongView): string {
    const who = [row.writer, row.year].filter(Boolean).join(", ");
    return `${who ? `${who}. ` : ""}${RightsHelper.notice(row.license || "", row.licenseVersion)}`;
  }

  /** Parent + siblings + children through parentSongId, the root first; the song itself is not its own family. */
  static family(song: SongView, rows: SongView[]): SongView[] {
    const root = song.parentSongId || song.id;
    const members = rows.filter((r) => r.id !== song.id && (r.id === root || r.parentSongId === root));
    return members.sort((a, b) => (a.id === root ? -1 : b.id === root ? 1 : 0));
  }

  /** Same language, not family: +2 same meter, +2 same scripture book, +1 per shared theme; top 6 with a one-sentence reason. */
  static similar(song: SongView, candidates: SongSummary[], familyIds: Set<string>, limit = SIMILAR_LIMIT): SimilarSong[] {
    const meter = this.normMeter(song.meter);
    const book = this.scriptureBook(song.scripture);
    const themes = this.themes(song.themes);
    const scored: { score: number; row: SimilarSong }[] = [];
    for (const c of candidates) {
      if (c.id === song.id || familyIds.has(c.id || "") || c.language !== song.language) continue;
      let score = 0;
      const parts: string[] = [];
      if (meter && this.normMeter(c.meter) === meter) { score += 2; parts.push(`same meter (${c.meter})`); }
      const cBook = this.scriptureBook(c.scripture);
      if (book && cBook && cBook.toLowerCase() === book.toLowerCase()) { score += 2; parts.push(`scripture from ${cBook}`); }
      const shared = this.themes(c.themes).filter((t) => themes.includes(t));
      if (shared.length) { score += shared.length; parts.push(`${shared.length === 1 ? "theme" : "themes"} ${shared.join(", ")}`); }
      if (!score) continue;
      scored.push({ score, row: { ...c, reason: this.sentence(parts) } });
    }
    return scored.sort((a, b) => b.score - a.score || (b.row.rank || 0) - (a.row.rank || 0)).slice(0, limit).map((s) => s.row);
  }

  /** "Rom 8:14-17" → "Rom", "1 John 4:7" → "1 John", "Johannes 15,10" → "Johannes". */
  static scriptureBook(ref: string | null | undefined): string | null {
    const m = /^\s*((?:[1-3]\s*)?[^\d:,;.]+?)\s*(?:\d|$)/.exec(ref || "");
    return m && m[1].trim() ? m[1].trim() : null;
  }

  private static normMeter(m: string | null | undefined): string {
    return (m || "").replace(/\s+/g, "").toUpperCase();
  }

  private static themes(v: string | null | undefined): string[] {
    return (v || "").split(",").map((t) => t.trim()).filter(Boolean);
  }

  private static sentence(parts: string[]): string {
    const joined = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] || "";
    return joined ? joined.charAt(0).toUpperCase() + joined.slice(1) + "." : "";
  }
}
