import { SongView } from "../models/index.js";

const LEADING_ARTICLE = /^(the|a|an)\s+/;
const STANZA_LABEL = /^(verse|chorus|refrain|bridge|pre-?chorus|intro|outro|tag|ending|interlude|coda)\b/i;

/**
 * A stanza label, or null for a sung line: a known heading ("Verse 2", "Chorus") or, as writers often chart it, any
 * chord-free line wholly in parentheses ("(Chorus x2)", "(Intro/Instrumental)") — labelled by the text inside.
 * The content repo's tools/lib.mjs sectionLabelOf and the site's chordpro.ts sectionLabel apply the same rule.
 */
export function sectionLabel(line: string): string | null {
  const plain = line.replace(/\[[^\]]*\]/g, "").trim();
  const paren = !/\[[^\]]+\]/.test(line) && plain.match(/^\((.+)\)$/);
  if (paren) return paren[1].trim();
  return STANZA_LABEL.test(plain) ? plain : null;
}

export interface DuplicateQuery {
  title?: string;
  writer?: string;
  firstLine?: string;
}

export interface DuplicateMatch {
  id: string;
  title: string;
  writer: string;
}

/** One notion of "this is the same song", shared by the submit-time warning and the review queue's duplicate flag. */
export class DuplicateHelper {
  /** lowercase, drop a leading article, keep only a-z0-9 — "The Old Rugged Cross" and "old rugged cross!" fold together */
  static foldName(name: string): string {
    return (name || "").toLowerCase().trim().replace(LEADING_ARTICLE, "").replace(/[^a-z0-9]/g, "");
  }

  static similarName(a: string, b: string): boolean {
    const x = DuplicateHelper.foldName(a), y = DuplicateHelper.foldName(b);
    if (!x || !y) return false;
    return x === y || (x.length >= 8 && y.length >= 8 && (x.startsWith(y) || y.startsWith(x)));
  }

  /** the first sung line of a chordPro body — {directives}, stanza labels and [chords] dropped */
  static firstLine(chordPro: string): string {
    for (const raw of (chordPro || "").split(/\r?\n/)) {
      const line = raw.replace(/\[[^\]]*\]/g, "").trim();
      if (!line || line.startsWith("{") || sectionLabel(raw)) continue;
      return line;
    }
    return "";
  }

  /** Published songs that look like the same song: title or first line has to match; a matching writer only ranks it higher. */
  static matches(query: DuplicateQuery, library: SongView[], limit = 5): DuplicateMatch[] {
    const line = DuplicateHelper.foldName(query.firstLine || "");
    const hits: { score: number; song: SongView }[] = [];
    for (const song of library) {
      let score = 0;
      if (DuplicateHelper.similarName(query.title || "", song.title || "")) score += 2;
      if (line && line === DuplicateHelper.foldName(DuplicateHelper.firstLine(song.chordPro || ""))) score += 2;
      if (!score) continue;
      if (DuplicateHelper.similarName(query.writer || "", song.writer || "")) score += 1;
      hits.push({ score, song });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit)
      .map(({ song }) => ({ id: song.id || "", title: song.title || "", writer: song.writer || "" }));
  }
}
