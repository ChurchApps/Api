import { fileRole } from "@churchapps/helpers";
import { Asset, AssetFile, Submission, SubmissionPayload } from "../models/index.js";
import { Repos } from "../repositories/Repos.js";
import { CommonsMailHelper } from "./CommonsMailHelper.js";
import { ContentLibraryHelper } from "./ContentLibraryHelper.js";
import { manifestHook, PUBLISH_HOOKS, PublishContext } from "./publishHooks/index.js";
import { userNames } from "./NamesHelper.js";
import { normalizeTags } from "./SubmitValidation.js";

const GENERIC_FIELDS = ["name", "description", "tags", "language", "license", "publisherChurchId"] as const;

// ponytail: no DB transaction — every step is idempotent (copy overwrites, delete is best-effort,
// the submission only flips to approved last), so a failed approve is simply retried.
export class PublishHelper {
  static async approve(repos: Repos, sub: Submission, asset: Asset, reviewerId: string, note?: string): Promise<void> {
    const payload = sub.payload || {};
    const generic: Partial<Asset> = {};
    for (const k of GENERIC_FIELDS) if (payload[k] !== undefined) (generic as any)[k] = payload[k];
    if (generic.tags !== undefined) generic.tags = normalizeTags(String(generic.tags));
    await repos.asset.update(asset.id || "", generic);
    Object.assign(asset, generic);

    const proposed = await repos.assetFile.loadBySubmission(sub.id || "");
    const filesChanged: { name: string; action: string }[] = [];
    for (const f of proposed) {
      const name = f.name || "";
      const live = await repos.assetFile.loadOne(asset.id || "", name, null);
      if (f.action === "remove") {
        await ContentLibraryHelper.removeKey(ContentLibraryHelper.liveKey(asset, name));
        if (live) await repos.assetFile.delete(live.id || "");
        await repos.assetFile.delete(f.id || "");
        filesChanged.push({ name, action: "remove" });
        continue;
      }
      const copied = await ContentLibraryHelper.promote(ContentLibraryHelper.pendingKey(sub.id || "", name), ContentLibraryHelper.liveKey(asset, name));
      if (!copied) throw new Error(`pending file missing: ${name}`);
      if (live) await repos.assetFile.delete(live.id || "");
      await repos.assetFile.update(f.id || "", { submissionId: null, action: "add" });
      filesChanged.push({ name, action: live ? "replace" : "add" });
    }

    const version = (await repos.submission.countApproved(asset.id || "")) + 1;
    const names = await userNames([asset.publisherUserId]);
    const ctx: PublishContext = {
      asset,
      submission: sub,
      detail: payload.detail || {},
      files: await repos.assetFile.loadLive(asset.id || ""),
      version,
      publisherName: names[asset.publisherUserId || ""],
      repos,
      writeFile: async (name, contentType, body) => {
        await ContentLibraryHelper.store(ContentLibraryHelper.liveKey(asset, name), contentType, body);
        await repos.assetFile.upsert({ assetId: asset.id, submissionId: null, name, action: "add", sizeBytes: body.length, contentHash: ContentLibraryHelper.sha256(body), uploadedBy: null as any });
        ctx.files = await repos.assetFile.loadLive(asset.id || "");
      }
    };
    await PUBLISH_HOOKS[asset.assetType || ""]?.onPublish(ctx);
    await manifestHook.onPublish(ctx);

    const now = new Date();
    await repos.asset.update(asset.id || "", { status: "published", publishedAt: asset.publishedAt || now, publishedSubmissionId: sub.id, unpublishedAt: null as any, removedReason: null as any });
    await repos.submission.update(sub.id || "", { status: "approved", reviewedBy: reviewerId, reviewedAt: now, reviewNote: note || null as any, filesChanged });
    await ContentLibraryHelper.removePrefix(ContentLibraryHelper.pendingPrefix(sub.id || ""));
    void CommonsMailHelper.notifyApproved(sub, asset.id || "").catch((e) => console.error("[CommonsMailHelper] approved failed:", e));
  }

  static async reject(repos: Repos, sub: Submission, asset: Asset | undefined, reviewerId: string, reason: string, note: string): Promise<void> {
    await repos.submission.update(sub.id || "", { status: "rejected", reviewedBy: reviewerId, reviewedAt: new Date(), reviewReason: reason, reviewNote: note });
    await this.discardProposed(repos, sub, asset);
    void CommonsMailHelper.notifyRejected(sub, reason, note).catch((e) => console.error("[CommonsMailHelper] rejected failed:", e));
  }

  /** Withdraw / delete: drops the proposed files and, when nothing was ever published, the asset itself. */
  static async discardProposed(repos: Repos, sub: Submission, asset: Asset | undefined, deleteSubmission = false): Promise<void> {
    await ContentLibraryHelper.removePrefix(ContentLibraryHelper.pendingPrefix(sub.id || ""));
    await repos.assetFile.deleteBySubmission(sub.id || "");
    if (deleteSubmission) await repos.submission.delete(sub.id || "");
    if (asset && asset.status === "pending") {
      const others = (await repos.submission.loadByAsset(asset.id || "", ["draft", "pending"])).filter((s) => s.id !== sub.id);
      if (!others.length) {
        await repos.assetFile.deleteByAsset(asset.id || "");
        await repos.asset.delete(asset.id || "");
      }
    }
  }

  /** Terminal takedown: files gone, id kept so links 410 with the reason. */
  static async remove(repos: Repos, asset: Asset, reason: string): Promise<void> {
    await ContentLibraryHelper.removePrefix(ContentLibraryHelper.livePrefix(asset));
    for (const sub of await repos.submission.loadByAsset(asset.id || "", ["draft", "pending"])) {
      await ContentLibraryHelper.removePrefix(ContentLibraryHelper.pendingPrefix(sub.id || ""));
      await repos.submission.update(sub.id || "", { status: "withdrawn" });
    }
    await repos.assetFile.deleteByAsset(asset.id || "");
    await repos.asset.update(asset.id || "", { status: "removed", removedReason: reason });
  }

  /** The editable snapshot: the published submission's payload, or one rebuilt from the row + satellite. */
  static async editablePayload(repos: Repos, asset: Asset): Promise<SubmissionPayload> {
    if (asset.publishedSubmissionId) {
      const published = await repos.submission.loadById(asset.publishedSubmissionId);
      if (published?.payload) return published.payload;
    }
    const payload: SubmissionPayload = { name: asset.name, description: asset.description, tags: asset.tags, language: asset.language, license: asset.license, publisherChurchId: asset.publisherChurchId, detail: {} };
    if (asset.assetType === "song") {
      const s = await repos.song.loadById(asset.id || "");
      if (s) payload.detail = { writer: s.writer, year: s.year, songKey: s.songKey, bpm: s.bpm, timeSignature: s.timeSignature, scripture: s.scripture, scriptureText: s.scriptureText, chordPro: s.chordPro, videoUrl: s.videoUrl, proAnswer: s.proAnswer, certified: true };
    }
    return payload;
  }

  /** Field-level diff between two payloads (generic + detail), for the review drawer and history. */
  static diffFields(from: SubmissionPayload | undefined, to: SubmissionPayload | undefined): { key: string; from: unknown; to: unknown }[] {
    const flat = (p?: SubmissionPayload) => {
      const out: Record<string, unknown> = {};
      for (const k of GENERIC_FIELDS) out[k] = p?.[k];
      for (const [k, v] of Object.entries(p?.detail || {})) out[`detail.${k}`] = v;
      return out;
    };
    const a = flat(from);
    const b = flat(to);
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    return keys.filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)).map((k) => ({ key: k, from: a[k], to: b[k] }));
  }

  static fileSummary(files: AssetFile[]): { name: string; action: string; role: string }[] {
    return files.map((f) => ({ name: f.name || "", action: f.action || "add", role: fileRole(f.name || "") }));
  }
}
