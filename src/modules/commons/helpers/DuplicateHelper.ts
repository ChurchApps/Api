import { SongView } from "../models/index.js";

const LEADING_ARTICLE = /^(the|a|an)\s+/;
// chordPro: stanzas separated by blank lines, first line of each is its label
const STANZA_LABEL = /^(verse|chorus|refrain|bridge|pre-?chorus|intro|outro|tag|ending|interlude|coda)\b/i;

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
      if (!line || line.startsWith("{") || STANZA_LABEL.test(line)) continue;
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
