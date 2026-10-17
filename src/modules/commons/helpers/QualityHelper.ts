import { Environment } from "../../../shared/helpers/Environment.js";
import { Song } from "../models/index.js";

// ponytail: gpt-4o-mini gave every amateur submission the identical 12/10/11/13; 4.1 with a hard-nosed rubric spreads them
const MODEL = "gpt-4.1";
const SYSTEM_PROMPT =
  "You are an experienced worship pastor screening song submissions (a ChordPro chart: chords in [brackets]) for a shared church library. " +
  "Judge whether a typical congregation could and would sing this. Be demanding: a competent amateur song scores 7-10 per dimension; " +
  "reserve 12+ for songs a church would add to its rotation; give 0-5 when the dimension is plainly broken. Use the whole range and do not default to the middle.\n" +
  "Score each dimension 0-15 (15 best):\n" +
  "coherence: lines make grammatical sense, images and viewpoint are consistent, verses connect to the chorus\n" +
  "depth: theological and emotional substance beyond stock phrases; a chorus that is one sentence repeated has little depth\n" +
  "craft: lines scan and could be sung to a steady meter; rhymes are natural, not forced; the structure is intentional. " +
  "Chords count: chords outside the song's key with no musical logic, random accidentals, or filler syllables stretched to fit (\"ee ee\") are serious craft defects\n" +
  "authenticity: a real human voice; penalize generic vocabulary, buzzword mashups, rhyme-forced nonsense and AI tells\n" +
  'Reply ONLY JSON: {"coherence":n,"depth":n,"craft":n,"authenticity":n,"notes":"one sentence naming the biggest weakness, for a human reviewer"}';

/** What the triage score is computed from — a song payload plus the roles of its resulting file set. */
export interface ScoreInput {
  id?: string;
  title?: string;
  writer?: string;
  chordPro?: string;
  scripture?: string;
  themes?: string;
  bpm?: number;
  songKey?: string;
  fileRoles?: string[];
}

export class QualityHelper {
  private static apiKey(): string {
    return Environment.openAiApiKey || process.env.OPENAI_API_KEY || "";
  }

  public static configured(): boolean {
    return !!this.apiKey();
  }

  public static heuristicScore(song: ScoreInput): number {
    return this.heuristicBreakdown(song).score;
  }

  private static heuristicBreakdown(song: ScoreInput): { score: number; parts: string[] } {
    const parts: string[] = [];
    let pts = 0;
    const files = new Set(song.fileRoles || []);
    if (files.has("demoAudio")) { pts += 8; parts.push("demo"); }
    if (files.has("sheetPdf")) { pts += 6; parts.push("sheet"); }
    if (files.has("stemsZip")) { pts += 6; parts.push("stems"); }
    if (song.scripture) { pts += 4; parts.push("scripture"); }
    if (song.themes) { pts += 4; parts.push("themes"); }
    if (song.bpm) { pts += 3; parts.push("bpm"); }
    if (song.songKey) { pts += 3; parts.push("key"); }
    const cp = this.chordProScore(song.chordPro || "");
    if (cp > 0) { pts += cp; parts.push("chordpro"); }
    return { score: pts, parts };
  }

  // ponytail: naive text stats — real chordpro parser if this misjudges songs
  private static chordProScore(cp: string): number {
    const lyrics = cp.replace(/\[[^\]]*\]/g, "").replace(/\{[^}]*\}/g, "");
    const lines = lyrics.split("\n").map((l) => l.trim()).filter(Boolean);
    let pts = 0;
    if (lyrics.length > 300) pts += 2;
    if (lines.length > 0 && (cp.match(/\[[A-G][#b]?[^\]]*\]/g) || []).length >= lines.length * 0.5) pts += 2;
    if (lines.length > 4 && new Set(lines).size / lines.length >= 0.4) pts += 2;
    return pts;
  }

  public static async llmScore(song: ScoreInput): Promise<{ llm: number; detail: any }> {
    const lyrics = (song.chordPro || "").slice(0, 6000); // chords stay in: wrong-key chords are a quality signal
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey()}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Title: ${song.title}\nWriter: ${song.writer || "unknown"}\n\n${lyrics}` }
        ]
      })
    });
    if (!res.ok) throw new Error(`OpenAI returned ${res.status}`);
    const body: any = await res.json();
    const d = JSON.parse(body?.choices?.[0]?.message?.content || "{}");
    const clamp = (n: any) => Math.max(0, Math.min(15, Number(n) || 0));
    const llm = Math.round(clamp(d.coherence) + clamp(d.depth) + clamp(d.craft) + clamp(d.authenticity));
    return { llm, detail: d };
  }

  public static async score(song: ScoreInput): Promise<Partial<Song>> {
    const { score: heuristic, parts } = this.heuristicBreakdown(song);
    if (!this.apiKey()) return { qualityScore: heuristic, qualityDetail: JSON.stringify({ heuristic, parts, llm: 0, notes: "completeness heuristic only — not an AI judgment" }) };
    try {
      const { llm, detail } = await this.llmScore(song);
      return { qualityScore: heuristic + llm, qualityDetail: JSON.stringify({ heuristic, parts, llm, ...detail }) };
    } catch (e) {
      console.error("Quality scoring failed", song.id, e);
      return { qualityScore: heuristic, qualityDetail: JSON.stringify({ heuristic, parts, llm: 0, notes: "completeness heuristic only — LLM scoring failed" }) };
    }
  }
}
