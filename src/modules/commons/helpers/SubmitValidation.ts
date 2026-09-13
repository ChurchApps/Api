import { AssetFileRole, AssetTypeDefinition, conventionalFileName, fileRole } from "@churchapps/helpers";
import { AssetFile, SubmissionPayload } from "../models/index.js";
import { baseName } from "./PackageLayout.js";

export const INLINE_MAX_BYTES = 1048576;
export const DEFAULT_MAX_FILE_BYTES = 26214400;
export const MAX_PENDING_PER_USER = 5;
export const MAX_SUBMITTED_PER_DAY = 20;
export const MIN_NOTE_LENGTH = 10;

export const SUBMISSION_TYPES = ["new", "translation", "arrangement", "correction", "additionalFile", "recording", "removal"] as const;
export type SubmissionType = (typeof SUBMISSION_TYPES)[number];
/** Types that create a package; the rest change a published one. */
export const NEW_PACKAGE_TYPES: readonly string[] = ["new", "translation", "arrangement"];
export const SUBMISSION_TYPE_LABELS: Record<SubmissionType, string> = {
  new: "new song",
  translation: "translation",
  arrangement: "arrangement",
  correction: "correction",
  additionalFile: "additional file",
  recording: "master recording",
  removal: "removal request"
};

/** What the payload proposes; `payload.type` wins, else inferred from the target and the parent-song fields the site already sends. */
export function submissionType(payload: SubmissionPayload | undefined, isNewAsset: boolean): string {
  if (payload?.type) return payload.type;
  if (!isNewAsset) return "correction";
  const detail = payload?.detail || {};
  if (detail.parentSongId) return /^translation/i.test(String(detail.relationLabel || "")) || detail.translator ? "translation" : "arrangement";
  return "new";
}

export function fileSpec(def: AssetTypeDefinition, name: string): AssetFileRole | undefined {
  return def.files.find((f) => f.role === fileRole(name));
}

/** True when `name` is a conventional, uploadable name for this type (right role, allowed extension). */
export function isUploadableName(def: AssetTypeDefinition, name: string): boolean {
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..") || name.length > 100) return false;
  const spec = fileSpec(def, name);
  return !!spec && !spec.generated && conventionalFileName(def, spec.role, name) === name;
}

/** The plain message for a name isUploadableName refused; the generated chart name says what to upload instead. */
export function notAcceptedMessage(def: AssetTypeDefinition | undefined, name: string): string {
  if (def && fileRole(name) === "chart") return `${name} is generated on publish — upload ChordPro text as lyrics.cho`;
  return `${name || "(unnamed)"} is not an accepted file for ${def?.label || "this type"}`;
}

/** The live file set after a submission's add/replace/remove actions apply. Live names carry their package folder, proposed names are flat: a file is the same file by basename. */
export function resultingFileNames(live: AssetFile[], proposed: AssetFile[]): string[] {
  const names = new Map(live.map((f) => [baseName(f.name), f.name || ""]));
  for (const f of proposed) {
    if (f.action === "remove") names.delete(baseName(f.name));
    else names.set(baseName(f.name), f.name || "");
  }
  return [...names.values()].filter(Boolean);
}

/** Split, trim, collapse spaces, title-case, drop empties, case-insensitive dedupe; join with `, `. */
export function normalizeTags(tags?: string | null): string {
  if (!tags) return "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of String(tags).split(",")) {
    const t = raw.trim().replace(/\s+/g, " ");
    if (!t) continue;
    const titled = t.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    const key = titled.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(titled);
  }
  return out.join(", ");
}

/** Error-level ChordPro lint (ported from the site's lintChordPro): every [ needs its ] on the same line. */
export function lintChordProBrackets(text: string): string[] {
  const errors: string[] = [];
  (text || "").split(/\r?\n/).forEach((line, i) => {
    let open = false;
    let broken = false;
    for (const ch of line) {
      if (ch === "[") { if (open) { broken = true; break; } open = true; } else if (ch === "]") { if (!open) { broken = true; break; } open = false; }
    }
    if (broken || open) errors.push(`Unmatched bracket on line ${i + 1} — every [ needs a closing ]`);
  });
  return errors;
}

/** Keys the proposal sets to something other than the live value; keys it leaves out are not changes. */
export function changedKeys(live: SubmissionPayload | undefined, proposed: SubmissionPayload | undefined): string[] {
  const out: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  for (const k of ["name", "description", "tags", "language", "license", "publisherChurchId"] as const) {
    if (proposed?.[k] !== undefined && !same(proposed[k], live?.[k])) out.push(k);
  }
  for (const [k, v] of Object.entries(proposed?.detail || {})) if (v !== undefined && !same(v, live?.detail?.[k])) out.push(`detail.${k}`);
  return out;
}

export interface ValidationContext {
  type?: string;
  note?: string;
  /** false when the target asset already has a published version */
  isNewAsset?: boolean;
  /** the parent song named by detail.parentSongId; null when it does not exist; undefined when not looked up */
  parent?: { status?: string; language?: string } | null;
  /** the published snapshot, so a removal can be checked for stray field changes */
  livePayload?: SubmissionPayload;
}

/** Returns every blocking problem with a submission; empty means it is acceptable. */
export function validateSubmission(def: AssetTypeDefinition, payload: SubmissionPayload, proposed: AssetFile[], live: AssetFile[], ctx: ValidationContext = {}): string[] {
  const type = ctx.type || submissionType(payload, ctx.isNewAsset !== false);
  if (!(SUBMISSION_TYPES as readonly string[]).includes(type)) return [`type must be one of: ${SUBMISSION_TYPES.join(", ")}`];
  if (type === "removal") return validateRemoval(payload, proposed, ctx);

  const errors: string[] = [];
  if (!payload?.name?.trim()) errors.push("name is required");
  else if (payload.name.length > 255) errors.push("name must be 255 characters or fewer");
  if (!def.licenses.includes(payload.license as any)) errors.push(`license must be one of: ${def.licenses.join(", ")}`);
  const detail = payload.detail || {};
  for (const field of def.detailFields || []) {
    const v = detail[field.key];
    const empty = v === undefined || v === null || v === "";
    if (field.required && empty) errors.push(`${field.label} is required`);
    if (!empty && field.maxLength && String(v).length > field.maxLength) errors.push(`${field.label} must be ${field.maxLength} characters or fewer`);
    if (!empty && field.type === "number" && Number.isNaN(Number(v))) errors.push(`${field.label} must be a number`);
    if (!empty && field.type === "select" && field.options && !field.options.includes(String(v))) errors.push(`${field.label} must be one of: ${field.options.join(", ")}`);
  }
  // ponytail: lints the pasted ChordPro only; an uploaded lyrics.cho is linted when a reviewer opens it
  if (typeof detail.chordPro === "string") errors.push(...lintChordProBrackets(detail.chordPro));

  for (const f of proposed) {
    const name = f.name || "";
    if (!isUploadableName(def, name)) errors.push(notAcceptedMessage(def, name));
    if (f.action !== "remove") {
      const spec = fileSpec(def, name);
      const max = spec?.maxBytes || DEFAULT_MAX_FILE_BYTES;
      if (!f.sizeBytes || f.sizeBytes <= 0) errors.push(`${name} is empty`);
      if (f.sizeBytes > max) errors.push(`${name} exceeds the ${Math.round(max / 1048576)}MB limit`);
    }
  }
  const resulting = resultingFileNames(live, proposed);
  const roles = new Set(resulting.map((n) => fileRole(baseName(n))));
  for (const spec of def.files) if (spec.required && !spec.generated && !roles.has(spec.role)) errors.push(`a ${spec.role} file is required`);

  const liveSizes = new Map(live.map((f) => [f.name || "", f.sizeBytes || 0]));
  for (const f of proposed) liveSizes.set(f.name || "", f.action === "remove" ? 0 : f.sizeBytes || 0);
  let total = 0;
  for (const n of resulting) total += liveSizes.get(n) || 0;
  if (total > def.maxTotalBytes) errors.push(`all files together exceed the ${Math.round(def.maxTotalBytes / 1048576)}MB limit`);

  // a master recording is its own rights layer: it needs a license from the uploadable set, which may differ from the composition's
  if (roles.has("master") && !def.licenses.includes(detail.masterLicense)) errors.push(`masterLicense must be one of: ${def.licenses.join(", ")}`);

  for (const att of def.attestations || []) {
    const required = !att.requiredWhenRole || proposed.some((f) => f.action !== "remove" && fileRole(f.name || "") === att.requiredWhenRole);
    if (required && detail[att.key] !== true) errors.push(`${att.key} confirmation is required`);
  }

  errors.push(...validateProposalType(type, payload, proposed, ctx));
  return errors;
}

// Rights triage per proposal type: missing answers block submission, not review (files.md 5.3 step 5).
function validateProposalType(type: string, payload: SubmissionPayload, proposed: AssetFile[], ctx: ValidationContext): string[] {
  const errors: string[] = [];
  const detail = payload.detail || {};
  const isNew = ctx.isNewAsset !== false;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (NEW_PACKAGE_TYPES.includes(type) && !isNew) errors.push(`a ${type} proposal creates a new song; send a correction, additionalFile or removal for a published one`);
  if (!NEW_PACKAGE_TYPES.includes(type) && isNew) errors.push(`a ${type} proposal changes a published song; this song is not published yet`);

  if (type === "translation" || type === "arrangement") {
    const noun = type === "translation" ? "a translation" : "an arrangement";
    const who = type === "translation" ? "translator" : "arranger";
    if (!text(detail[who])) errors.push(`${type === "translation" ? "Translator" : "Arranger"} is required for ${noun}`);
    if (!text(detail.parentSongId)) errors.push(`The original song is required for ${noun}`);
    else if (ctx.parent !== undefined) {
      if (!ctx.parent || ctx.parent.status !== "published") errors.push("The original song is not in the library");
      else if (type === "translation" && ctx.parent.language && (payload.language || "English") === ctx.parent.language) errors.push(`A translation must be in a different language from the original (${ctx.parent.language})`);
    }
  }
  if (type === "correction" || type === "additionalFile" || type === "recording") {
    if (text(ctx.note).length < MIN_NOTE_LENGTH) errors.push(`A note of at least ${MIN_NOTE_LENGTH} characters is required: say what changed and why`);
    if (type === "additionalFile" && !proposed.some((f) => f.action !== "remove")) errors.push("An additionalFile proposal must add a file");
    if (type === "recording" && !proposed.some((f) => f.action !== "remove" && fileRole(f.name || "") === "master")) errors.push("A recording proposal must add a master file");
  }
  return errors;
}

// A removal request is only a note: no files, no field changes; the existing fields are not re-validated.
function validateRemoval(payload: SubmissionPayload, proposed: AssetFile[], ctx: ValidationContext): string[] {
  const errors: string[] = [];
  if (ctx.isNewAsset !== false) errors.push("A removal request needs a published song");
  if ((ctx.note || "").trim().length < MIN_NOTE_LENGTH) errors.push(`A note of at least ${MIN_NOTE_LENGTH} characters is required: say why the song should come down`);
  if (proposed.length) errors.push("A removal request cannot include files");
  const changed = ctx.livePayload ? changedKeys(ctx.livePayload, payload) : [];
  if (changed.length) errors.push(`A removal request cannot change fields (${changed.join(", ")})`);
  return errors;
}
