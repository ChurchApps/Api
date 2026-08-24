import { AssetFileRole, AssetTypeDefinition, conventionalFileName, fileRole } from "@churchapps/helpers";
import { AssetFile, SubmissionPayload } from "../models/index.js";

export const INLINE_MAX_BYTES = 1048576;
export const DEFAULT_MAX_FILE_BYTES = 26214400;
export const MAX_PENDING_PER_USER = 5;
export const MAX_SUBMITTED_PER_DAY = 20;

export function fileSpec(def: AssetTypeDefinition, name: string): AssetFileRole | undefined {
  return def.files.find((f) => f.role === fileRole(name));
}

/** True when `name` is a conventional, uploadable name for this type (right role, allowed extension). */
export function isUploadableName(def: AssetTypeDefinition, name: string): boolean {
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..") || name.length > 100) return false;
  const spec = fileSpec(def, name);
  return !!spec && !spec.generated && conventionalFileName(def, spec.role, name) === name;
}

/** The live file set after a submission's add/replace/remove actions apply. */
export function resultingFileNames(live: AssetFile[], proposed: AssetFile[]): string[] {
  const names = new Set(live.map((f) => f.name || ""));
  for (const f of proposed) {
    if (f.action === "remove") names.delete(f.name || "");
    else names.add(f.name || "");
  }
  return [...names].filter(Boolean);
}

/** Returns the first blocking problem with a submission, or null when it is acceptable. */
export function validateSubmission(def: AssetTypeDefinition, payload: SubmissionPayload, proposed: AssetFile[], live: AssetFile[]): string | null {
  if (!payload?.name?.trim()) return "name is required";
  if (payload.name.length > 255) return "name must be 255 characters or fewer";
  if (!def.licenses.includes(payload.license as any)) return `license must be one of: ${def.licenses.join(", ")}`;
  const detail = payload.detail || {};
  for (const field of def.detailFields || []) {
    const v = detail[field.key];
    const empty = v === undefined || v === null || v === "";
    if (field.required && empty) return `${field.label} is required`;
    if (!empty && field.maxLength && String(v).length > field.maxLength) return `${field.label} must be ${field.maxLength} characters or fewer`;
    if (!empty && field.type === "number" && Number.isNaN(Number(v))) return `${field.label} must be a number`;
    if (!empty && field.type === "select" && field.options && !field.options.includes(String(v))) return `${field.label} must be one of: ${field.options.join(", ")}`;
  }

  for (const f of proposed) {
    const name = f.name || "";
    if (!isUploadableName(def, name)) return `${name || "(unnamed)"} is not an accepted file for ${def.label}`;
    if (f.action !== "remove") {
      const spec = fileSpec(def, name);
      const max = spec?.maxBytes || DEFAULT_MAX_FILE_BYTES;
      if (!f.sizeBytes || f.sizeBytes <= 0) return `${name} is empty`;
      if (f.sizeBytes > max) return `${name} exceeds the ${Math.round(max / 1048576)}MB limit`;
    }
  }
  const resulting = resultingFileNames(live, proposed);
  const roles = new Set(resulting.map((n) => fileRole(n)));
  for (const spec of def.files) if (spec.required && !spec.generated && !roles.has(spec.role)) return `a ${spec.role} file is required`;

  const liveSizes = new Map(live.map((f) => [f.name || "", f.sizeBytes || 0]));
  for (const f of proposed) liveSizes.set(f.name || "", f.action === "remove" ? 0 : f.sizeBytes || 0);
  let total = 0;
  for (const n of resulting) total += liveSizes.get(n) || 0;
  if (total > def.maxTotalBytes) return `all files together exceed the ${Math.round(def.maxTotalBytes / 1048576)}MB limit`;

  for (const att of def.attestations || []) {
    const required = !att.requiredWhenRole || proposed.some((f) => f.action !== "remove" && fileRole(f.name || "") === att.requiredWhenRole);
    if (required && detail[att.key] !== true) return `${att.key} confirmation is required`;
  }
  return null;
}
