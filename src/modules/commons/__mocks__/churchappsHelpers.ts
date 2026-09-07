// Jest cannot load the ESM-only @churchapps/helpers build, so tests mock it with a fixture
// registry that mirrors the shape of the real ASSET_TYPES entries used here.
const MB = 1048576;
export const COMMONS_PRODUCT_LABELS = { worshipcommons: "WorshipCommons", freeshow: "FreeShow", lessons: "Lessons", b1: "B1" };
export const ASSET_TYPES: Record<string, any> = {
  song: {
    key: "song",
    label: "Song",
    product: "worshipcommons",
    licenses: ["WC", "PD", "CC-BY"],
    defaultLicense: "WC",
    files: [
      { role: "demoAudio", namePattern: "demoAudio.{ext}", extensions: ["mp3", "wav"], maxBytes: 25 * MB },
      { role: "sheetPdf", namePattern: "sheetPdf.{ext}", extensions: ["pdf"], maxBytes: 25 * MB },
      { role: "stemsZip", namePattern: "stemsZip.{ext}", extensions: ["zip"], maxBytes: 50 * MB },
      { role: "midi", namePattern: "tune.mid", extensions: ["mid", "midi"], maxBytes: MB },
      { role: "abc", namePattern: "tune.abc", extensions: ["abc"], maxBytes: MB },
      { role: "song", namePattern: "song.json", extensions: ["json"], generated: true },
      { role: "chart", namePattern: "lyrics.chordpro", extensions: ["chordpro"], generated: true },
      { role: "manifest", namePattern: "manifest.json", extensions: ["json"], generated: true }
    ],
    detailFields: [
      { key: "writer", label: "Writer(s)", type: "text", required: true, maxLength: 255 },
      { key: "chordPro", label: "Lyrics and chords", type: "textarea", required: true, maxLength: 100000 },
      { key: "bpm", label: "Tempo (BPM)", type: "number" }
    ],
    attestations: [
      { key: "certified", label: "certified" },
      { key: "recordingOwned", label: "owned", requiredWhenRole: "demoAudio" }
    ],
    maxTotalBytes: 100 * MB,
    previewUrl: "https://worshipcommons.org/preview/submission/{submissionId}?token={token}"
  },
  "freeshow/template": {
    key: "freeshow/template",
    label: "FreeShow template",
    product: "freeshow",
    licenses: ["CC0", "CC-BY"],
    defaultLicense: "CC0",
    files: [
      { role: "content", namePattern: "content.{ext}", extensions: ["fstemplate", "json"], required: true, maxBytes: 25 * MB },
      { role: "thumb", namePattern: "thumb.{ext}", extensions: ["png"], maxBytes: 2 * MB },
      { role: "manifest", namePattern: "manifest.json", extensions: ["json"], generated: true }
    ],
    maxTotalBytes: 50 * MB
  }
};
export const FILE_ROLE_ALIASES: Record<string, string> = { "tune.mid": "midi", "tune.abc": "abc", "timing.json": "timing", "art-thumb.webp": "thumb", "lyrics.chordpro": "chart" };
export const fileRole = (name: string): string => FILE_ROLE_ALIASES[name] ?? name.replace(/\.[^.]+$/, "");
export function conventionalFileName(def: any, role: string, originalName: string): string | null {
  const spec = def.files.find((f: any) => f.role === role);
  if (!spec || spec.generated) return null;
  const ext = (originalName.includes(".") ? originalName.split(".").pop() || "" : "").toLowerCase();
  if (!spec.extensions.includes(ext)) return null;
  return spec.namePattern.replace("{ext}", ext);
}
