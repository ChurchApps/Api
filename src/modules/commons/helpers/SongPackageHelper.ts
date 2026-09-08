import { Confidence, Contributor, FormMap, RightsLayer, RightsMap, RightsMatrix, SongView } from "../models/index.js";
import { parseContributors } from "./ContributorsHelper.js";
import { DuplicateHelper } from "./DuplicateHelper.js";
import { RightsHelper } from "./RightsHelper.js";

// The package model on the read side: how a songs row plus its served files becomes the summary and
// detail payloads of the contract (confidence tier, has* flags, rights matrix, form map, similar
// songs). Pure — storage and repos stay in the controllers so this is unit-testable without mocks.

const CHORD = /\[[A-G][#b]?[^\]]*\]/;
const RIGHTS_LAYERS = ["text", "translation", "tune", "arrangement", "recording", "artwork"] as const;
const SIMILAR_LIMIT = 6;

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

  /** Draft form map from the stanza labels: first line of each blank-line-separated stanza is its label. */
  static draftForm(chordPro: string | null | undefined): FormMap | null {
    const labels: string[] = [];
    for (const stanza of (chordPro || "").split(/\r?\n\s*\r?\n/)) {
      const first = stanza.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith("{"));
      if (first) labels.push(first.replace(/\[[^\]]*\]/g, "").trim().slice(0, 40));
    }
    if (!labels.length) return null;
    return { status: "draft", sections: labels.map((label, i) => ({ label, lyric: i + 1 })), defaultOrder: labels };
  }

  /** The tier a package earns from its files alone; "sunday-ready" is only ever granted by the listen gate. */
  static baseConfidence(p: { hasScore: boolean; scoreSource?: string | null; hasChords: boolean }): Confidence {
    if (p.hasScore) {
      if (p.scoreSource === "master") return "proofread-score";
      if (p.scoreSource === "midi") return "generated-from-midi";
      return "converted-from-abc";
    }
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
    const { portraitKey: _portraitKey, qualityScore: _qualityScore, ...rest } = row as SongView & { portraitKey?: string };
    return {
      ...rest,
      confidence: (row.confidence as Confidence) || null,
      sundayReady: row.confidence === "sunday-ready",
      featured: !!row.featured,
      firstLine: row.firstLine || null,
      tune: row.tune || null,
      hymnalCount: row.hymnalCount || 0,
      hasChords: !!row.hasChords,
      hasScore: !!fileUrls.score,
      hasSlides: !!fileUrls.slides,
      hasTiming: !!fileUrls.timing,
      hasAccompaniment: false, // demoAudio is a writer demo, not accompaniment; no rendered accompaniment exists yet
      recommendedKey: row.recommendedKey || null,
      singTimeSeconds: row.singTimeSeconds ?? null,
      fileUrls
    };
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
