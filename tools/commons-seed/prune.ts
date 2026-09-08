// Selection logic for tools/manual/commons-prune-flat-mirror.ts, kept pure so it is unit-tested without S3.
// The flat mirror (commons/songs/, commons/works/, commons/writers/) predates the id-keyed packages under
// commons/assets/song/<id>/{sources,masters,derivatives}/; once those are live it is dead weight — except the
// writer portraits, which authors.portraitUrl still points at until the writer packages move under assets/.

export const FLAT_MIRROR_PREFIXES = ["commons/songs/", "commons/works/", "commons/writers/"] as const;

export interface PrunePlan { prune: string[]; kept: string[]; }

/** Normalises a stored portraitUrl / key to the bucket key form: no leading slash, no URL scheme or host. */
export function keepKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = value.replace(/^https?:\/\/[^/]+\//, "").replace(/^\/+/, "");
  return key.startsWith("commons/") ? key : null;
}

/** Splits every key under the flat-mirror prefixes into what to delete and what a referenced portrait keeps. */
export function selectPruneKeys(keys: Iterable<string>, keep: Iterable<string | null | undefined>): PrunePlan {
  const kept = new Set<string>();
  for (const k of keep) { const key = keepKey(k); if (key) kept.add(key); }
  const plan: PrunePlan = { prune: [], kept: [] };
  for (const key of keys) {
    if (!FLAT_MIRROR_PREFIXES.some((p) => key.startsWith(p))) continue; // never touch anything outside the mirror
    if (kept.has(key)) plan.kept.push(key);
    else plan.prune.push(key);
  }
  return plan;
}
