import { Environment } from "../../../shared/helpers/Environment.js";
import { Song, SongView } from "../models/index.js";
import { ContentLibraryHelper } from "./ContentLibraryHelper.js";

const MODEL = "gpt-4o-mini";
const SYSTEM_PROMPT =
  "You review worship song lyrics submitted to a shared church song library. Score each dimension 0-15 (15 best):\n" +
  "coherence: lyrics make sense, consistent imagery and viewpoint\n" +
  "depth: theological/emotional substance, not just stock phrases\n" +
  "craft: intentional structure and repetition; penalize filler or endless copy-paste\n" +
  "authenticity: penalize AI-generated tells (generic vocabulary, rhyme-forced nonsense, buzzword mashups)\n" +
  'Reply ONLY JSON: {"coherence":n,"depth":n,"craft":n,"authenticity":n,"notes":"one sentence for a human reviewer"}';

export class QualityHelper {
  private static apiKey(): string {
    return Environment.openAiApiKey || process.env.OPENAI_API_KEY || "";
  }

  public static heuristicScore(song: SongView): number {
    let pts = 0;
    const files = new Set(ContentLibraryHelper.fileList(song).map((n) => ContentLibraryHelper.fileKey(n)));
    if (files.has("demoAudio")) pts += 8;
    if (files.has("sheetPdf")) pts += 6;
    if (files.has("stemsZip")) pts += 6;
    if (song.scripture) pts += 4;
    if (song.themes) pts += 4;
    if (song.bpm) pts += 3;
    if (song.songKey) pts += 3;
    pts += this.chordProScore(song.chordPro || "");
    return pts;
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

  public static async llmScore(song: SongView): Promise<{ llm: number; detail: any }> {
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

  public static async score(song: SongView): Promise<Partial<Song>> {
    const heuristic = this.heuristicScore(song);
    if (!this.apiKey()) return { qualityScore: heuristic, qualityDetail: JSON.stringify({ heuristic, llm: 0, notes: "heuristic only — no OpenAI key configured" }) };
    try {
      const { llm, detail } = await this.llmScore(song);
      return { qualityScore: heuristic + llm, qualityDetail: JSON.stringify({ heuristic, llm, ...detail }) };
    } catch (e) {
      console.error("Quality scoring failed", song.id, e);
      return { qualityScore: heuristic, qualityDetail: JSON.stringify({ heuristic, llm: 0, notes: "heuristic only — llm scoring failed" }) };
    }
  }
}
