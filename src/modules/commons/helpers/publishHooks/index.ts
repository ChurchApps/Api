import { fileRole } from "@churchapps/helpers";
import { Asset, AssetFile, Submission } from "../../models/index.js";
import { Repos } from "../../repositories/Repos.js";
import { songPublishHook } from "./song.js";

export interface PublishContext {
  asset: Asset;
  submission: Submission;
  detail: Record<string, any>;
  files: AssetFile[];
  version: number;
  publisherName?: string;
  repos: Repos;
  writeFile(name: string, contentType: string, body: Buffer): Promise<void>;
}

export interface PublishHook {
  onPublish(ctx: PublishContext): Promise<void>;
  onUnpublish?(ctx: PublishContext): Promise<void>;
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
      detail: ctx.detail
    };
    await ctx.writeFile("manifest.json", "application/json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n"));
  }
};

// freeshow/*, lesson, b1/* have no entry: the file is the artifact and the manifest hook covers browse metadata
export const PUBLISH_HOOKS: Record<string, PublishHook> = { song: songPublishHook };
