import { Environment } from "../../../shared/helpers/Environment.js";
import { Song } from "../models/index.js";

const MODEL = "gpt-4o-mini";
const SYSTEM_PROMPT =
  "You review worship song lyrics submitted to a shared church song library. Score each dimension 0-15 (15 best):\n" +
  "coherence: lyrics make sense, consistent imagery and viewpoint\n" +
  "depth: theological/emotional substance, not just stock phrases\n" +
  "craft: intentional structure and repetition; penalize filler or endless copy-paste\n" +
  "authenticity: penalize AI-generated tells (generic vocabulary, rhyme-forced nonsense, buzzword mashups)\n" +
  'Reply ONLY JSON: {"coherence":n,"depth":n,"craft":n,"authenticity":n,"notes":"one sentence for a human reviewer"}';

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
    const lyrics = (song.chordPro || "").replace(/\[[^\]]*\]/g, "").slice(0, 6000);
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
