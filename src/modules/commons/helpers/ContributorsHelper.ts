import { Contributor } from "../models/index.js";

/** songs.contributors is a JSON array; anything unreadable is treated as empty. */
export function parseContributors(raw: unknown): Contributor[] {
  if (Array.isArray(raw)) return raw as Contributor[];
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

/** Appends credit rows, deduped by (submissionId, what) so an approve retry never double-credits. */
export function appendContributors(existing: Contributor[], rows: Contributor[]): Contributor[] {
  const out = [...existing];
  for (const row of rows) {
    if (!row.name) continue;
    if (row.submissionId && out.some((c) => c.submissionId === row.submissionId && c.what === row.what)) continue;
    out.push(row);
  }
  return out;
}
