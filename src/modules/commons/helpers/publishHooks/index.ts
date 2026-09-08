import { fileRole } from "@churchapps/helpers";
import { Asset, AssetFile, Submission } from "../../models/index.js";
import { Repos } from "../../repositories/Repos.js";
import { songPublishHook } from "./song.js";

export interface PublishContext {
  asset: Asset;
  submission: Submission;
  detail: Record<string, any>;
  files: AssetFile[];
  /** what this approval did to the live file set */
  filesChanged: { name: string; action: string }[];
  version: number;
  publisherName?: string;
  submitterName?: string;
  repos: Repos;
  /** a live file's bytes, or null when it does not exist */
  readFile(name: string): Promise<Buffer | null>;
  writeFile(name: string, contentType: string, body: Buffer): Promise<void>;
}

export interface PublishHook {
  onPublish(ctx: PublishContext): Promise<void>;
  onUnpublish?(ctx: PublishContext): Promise<void>;
}

/** One row per contributor upload, shaped like the content repo's sources/manifest.json. */
export interface SourceRow {
  file: string;
  url: string | null;
  acquired: string;
  sha256: string | null;
  licenseBasis: string;
  original: boolean;
  submittedBy: string | null;
  submission: string | null;
  note: string | null;
}

const isoDate = (d?: Date | string | null) => (d ? new Date(d) : new Date()).toISOString().slice(0, 10);

/**
 * The sources inventory: a row for every live file a contributor uploaded. Rows from earlier approvals are
 * preserved from the previous manifest as long as the file still exists with the same hash; files this
 * approval added or replaced get a fresh row naming this submission.
 */
export async function sourceRows(ctx: PublishContext): Promise<SourceRow[]> {
  let previous: SourceRow[] = [];
  try {
    const raw = await ctx.readFile("manifest.json");
    const parsed = raw ? JSON.parse(raw.toString("utf8")) : null;
    if (Array.isArray(parsed?.sources)) previous = parsed.sources;
  } catch { /* no usable previous manifest */ }
  const changed = new Set(ctx.filesChanged.filter((c) => c.action !== "remove").map((c) => c.name));
  const rows: SourceRow[] = [];
  for (const f of ctx.files) {
    const name = f.name || "";
    if (!name || !f.uploadedBy) continue; // generated files have no uploader
    const kept = previous.find((p) => p.file === name && p.sha256 === (f.contentHash || null));
    if (!changed.has(name) && kept) { rows.push(kept); continue; }
    const mine = changed.has(name);
    rows.push({
      file: name,
      url: null,
      acquired: mine ? isoDate() : isoDate(f.createdAt),
      sha256: f.contentHash || null,
      licenseBasis: "contributor",
      original: true,
      submittedBy: mine ? ctx.submission.submittedBy || f.uploadedBy : f.uploadedBy,
      submission: mine ? ctx.submission.id || null : null,
      note: mine ? ctx.submission.note || null : null
    });
  }
  return rows;
}

/** Runs for every type: one unauthenticated GET tells any client what an asset is and which files it has. */
export const manifestHook: PublishHook = {
  async onPublish(ctx) {
    const manifest = {
      id: ctx.asset.id,
      assetType: ctx.asset.assetType,
      name: ctx.asset.name,
      description: ctx.asset.description,
      tags: ctx.asset.tags,
      language: ctx.asset.language,
      license: ctx.asset.license,
      publisher: { userName: ctx.publisherName, churchId: ctx.asset.publisherChurchId },
      version: ctx.version,
      publishedAt: (ctx.asset.publishedAt || new Date()).toISOString(),
      files: ctx.files.filter((f) => f.name !== "manifest.json").map((f) => ({ name: f.name, role: fileRole(f.name || ""), sizeBytes: f.sizeBytes, sha256: f.contentHash })),
      // ponytail: lives inside manifest.json rather than a second sources/manifest.json object; the content
      // repo export can split it out when it reads the package
      sources: await sourceRows(ctx),
      detail: ctx.detail
    };
    await ctx.writeFile("manifest.json", "application/json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n"));
  }
};

// freeshow/*, lesson, b1/* have no entry: the file is the artifact and the manifest hook covers browse metadata
export const PUBLISH_HOOKS: Record<string, PublishHook> = { song: songPublishHook };
