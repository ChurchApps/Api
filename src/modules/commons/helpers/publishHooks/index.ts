import { Asset, AssetFile, Submission } from "../../models/index.js";
import { MASTER_ATTESTATION } from "../AssetTypes.js";
import { ContentLibraryHelper } from "../ContentLibraryHelper.js";
import { packageRole, relativeName } from "../PackageLayout.js";
import { Repos } from "../../repositories/Repos.js";
import { songPublishHook } from "./song.js";

export interface PublishContext {
  asset: Asset;
  submission: Submission;
  detail: Record<string, any>;
  files: AssetFile[];
  /** what this approval added, replaced, removed or declined — hooks use it to invalidate derived state and credit uploads */
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

/** One row per source file, the content repo's sources/manifest.json shape (files.md 1.6) plus the submission that carried it. */
export interface SourceRow {
  file: string;
  url: string | null;
  acquired: string | null;
  sha256: string | null;
  licenseBasis: string;
  original: boolean;
  submittedBy: string | null;
  submission?: string | null;
  note: string | null;
  /** grant fields (content repo .notes/song-pipeline.md §2); tools/pack/build.py needs them on a master's row */
  layer?: string;
  license?: string;
  obtainedVia?: string;
  evidence?: string;
}

const isoDate = (d?: Date | string | null) => (d ? new Date(d) : new Date()).toISOString().slice(0, 10);

/** Manifest row name: relative to sources/ ("tune.mid", "master/master.wav"); an upload placed elsewhere keeps its folder ("masters/art.png"). */
export function sourceFileName(name: string | null | undefined): string {
  return relativeName(name).replace(/^sources\//, "");
}

// the repo shape ({files:[{file,…}]}), or the pre-cut-over root manifest.json ({sources:[…]}) a legacy song still holds
async function previousRows(ctx: PublishContext): Promise<SourceRow[]> {
  const candidates = ctx.asset.assetType === "song" ? ["sources/manifest.json", "manifest.json"] : ["manifest.json"];
  for (const name of candidates) {
    try {
      const raw = await ctx.readFile(name);
      if (!raw) continue;
      const parsed = JSON.parse(raw.toString("utf8"));
      const files = Array.isArray(parsed?.files) && parsed.files.every((r: any) => typeof r?.file === "string") ? parsed.files : null;
      const rows = files ?? (Array.isArray(parsed?.sources) ? parsed.sources : null);
      if (rows) return rows.filter((r: any) => typeof r?.file === "string").map((r: any) => ({ ...r, file: sourceFileName(r.file) }));
    } catch { /* no usable previous manifest */ }
  }
  return [];
}

/**
 * The sources inventory: every row of the previous manifest (harvested files, earlier uploads) survives unless
 * this approval removed the file; each live file a contributor uploaded gets a row — kept from the previous
 * manifest while the hash matches, freshly written (naming this submission) when this approval added or replaced it.
 */
export async function sourceRows(ctx: PublishContext): Promise<SourceRow[]> {
  const removed = new Set(ctx.filesChanged.filter((c) => c.action === "remove").map((c) => sourceFileName(c.name)));
  const changed = new Set(ctx.filesChanged.filter((c) => c.action !== "remove" && c.action !== "declined").map((c) => sourceFileName(c.name)));
  const rows = new Map<string, SourceRow>();
  for (const p of await previousRows(ctx)) if (!removed.has(p.file)) rows.set(p.file, p);
  for (const f of ctx.files) {
    if (!f.name || !f.uploadedBy) continue; // generated and seeded files have no uploader
    const file = sourceFileName(f.name);
    const kept = rows.get(file);
    if (!changed.has(file) && kept && kept.sha256 === (f.contentHash || null)) continue;
    const mine = changed.has(file);
    rows.set(file, {
      file,
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
  return [...rows.values()];
}

/**
 * Runs for every type. A song package carries the content repo's sources/manifest.json (one row per source file;
 * the browse metadata is the database's) so `sync pull` takes the package as-is. Every other asset keeps one
 * unauthenticated manifest.json at its root telling any client what it is and which files it has.
 */
export const manifestHook: PublishHook = {
  async onPublish(ctx) {
    if (ctx.asset.assetType === "song") {
      const files = await sourceRows(ctx);
      await recordRecordingGrant(ctx, files);
      const body = { files };
      await ctx.writeFile("sources/manifest.json", "application/json", Buffer.from(JSON.stringify(body, null, 2) + "\n"));
      return;
    }
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
      files: ctx.files.filter((f) => f.name !== "manifest.json").map((f) => ({ name: f.name, role: packageRole(f.name), sizeBytes: f.sizeBytes, sha256: f.contentHash })),
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

/**
 * A master recording approved in this submission, with the uploader's ownership attestation, gets the grant record
 * the content repo's pack builder requires: the attestation filed as sources/grants/recording-<submission>.txt and
 * the master's manifest row pointing at it with the recording's license. Without it build.py makes no stems pack.
 */
async function recordRecordingGrant(ctx: PublishContext, rows: SourceRow[]): Promise<void> {
  const master = rows.find((r) => r.submission === ctx.submission.id && r.file.startsWith("master/"));
  if (!master || ctx.detail[MASTER_ATTESTATION.key] !== true) return;
  const license = typeof ctx.detail.masterLicense === "string" && ctx.detail.masterLicense ? ctx.detail.masterLicense : ctx.asset.license || "";
  const evidence = `grants/recording-${ctx.submission.id}.txt`;
  const text = [
    "Recording grant, made through the WorshipCommons upload form",
    "",
    `Song: ${ctx.asset.name} (${ctx.asset.id})`,
    `File: sources/${master.file} (sha256 ${master.sha256 || "unknown"})`,
    `License: ${license}`,
    `Granted by: ${ctx.submitterName || "unknown"} (ChurchApps user ${master.submittedBy || "unknown"})`,
    `Date: ${master.acquired}`,
    `Submission: ${ctx.submission.id}`,
    "",
    "The uploader confirmed:",
    `  "${MASTER_ATTESTATION.label}"`,
    ""
  ].join("\n");
  const body = Buffer.from(text);
  await ctx.writeFile(`sources/${evidence}`, "text/plain; charset=utf-8", body);
  const grant = { license, obtainedVia: "upload-form", evidence };
  Object.assign(master, { layer: "recording", ...grant });
  const row: SourceRow = { file: evidence, url: null, acquired: master.acquired, sha256: ContentLibraryHelper.sha256(body), licenseBasis: "contributor", original: true, submittedBy: master.submittedBy, submission: ctx.submission.id, note: null, layer: "grant", ...grant };
  const i = rows.findIndex((r) => r.file === evidence);
  if (i >= 0) rows[i] = row;
  else rows.push(row);
}
