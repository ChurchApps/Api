import { ASSET_TYPES } from "@churchapps/helpers";
import { fileRole } from "@churchapps/helpers";
import { Asset, AssetFile, Submission, SubmissionPayload } from "../models/index.js";
import { Repos } from "../repositories/Repos.js";
import { ContentLibraryHelper } from "./ContentLibraryHelper.js";
import { QualityHelper } from "./QualityHelper.js";
import { isUploadableName, MAX_PENDING_PER_USER, MAX_SUBMITTED_PER_DAY, resultingFileNames, validateSubmission } from "./SubmitValidation.js";

export interface Actor { id?: string; churchId?: string; }
export type Outcome<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): Outcome<never> => ({ ok: false, status, error });

/** The submission lifecycle, shared by the submissions controller and the legacy shims. */
export class SubmissionHelper {
  static async createDraft(repos: Repos, au: Actor, body: { assetId?: string; assetType?: string; payload?: SubmissionPayload; note?: string }): Promise<Outcome<{ submission: Submission; asset: Asset }>> {
    const payload = body.payload || {};
    let asset: Asset | undefined;
    if (body.assetId) {
      asset = await repos.asset.loadById(body.assetId);
      if (!asset || asset.status === "removed") return fail(404, "asset not found");
    } else {
      const def = ASSET_TYPES[body.assetType || ""];
      if (!def) return fail(400, "assetType is required");
      asset = await repos.asset.create({
        assetType: def.key,
        name: (payload.name || "").trim() || "Untitled",
        description: payload.description,
        tags: payload.tags,
        language: payload.language || "English",
        license: def.licenses.includes(payload.license as any) ? payload.license : def.defaultLicense,
        publisherUserId: au.id,
        publisherChurchId: au.churchId,
        status: "pending"
      });
    }
    const submission = await repos.submission.create({ assetId: asset.id, submittedBy: au.id, payload, note: body.note?.slice(0, 500) });
    return { ok: true, value: { submission, asset } };
  }

  /** Records (or re-records) a proposed file; the action is inferred from whether a live file of that name exists. */
  static async recordFile(repos: Repos, sub: Submission, asset: Asset, file: { name: string; sizeBytes?: number; contentHash?: string; action?: string }, uploadedBy?: string): Promise<Outcome<AssetFile>> {
    const def = ASSET_TYPES[asset.assetType || ""];
    if (!def || !isUploadableName(def, file.name)) return fail(400, `${file.name} is not an accepted file for ${def?.label || asset.assetType}`);
    const live = await repos.assetFile.loadOne(asset.id || "", file.name, null);
    const action = file.action === "remove" ? "remove" : live ? "replace" : "add";
    if (action === "remove" && !live) return fail(400, `${file.name} is not a live file`);
    const row = await repos.assetFile.upsert({ assetId: asset.id, submissionId: sub.id, name: file.name, action, sizeBytes: file.sizeBytes, contentHash: file.contentHash, uploadedBy });
    return { ok: true, value: row };
  }

  static async storeInline(repos: Repos, sub: Submission, asset: Asset, name: string, contentType: string, buffer: Buffer, uploadedBy?: string): Promise<Outcome<AssetFile>> {
    if (!buffer.length) return fail(400, `${name} is empty`);
    const def = ASSET_TYPES[asset.assetType || ""];
    if (!def || !isUploadableName(def, name)) return fail(400, `${name} is not an accepted file for ${def?.label || asset.assetType}`);
    await ContentLibraryHelper.storePending(ContentLibraryHelper.pendingKey(sub.id || "", name), contentType || ContentLibraryHelper.contentTypeFor(name), buffer);
    return await this.recordFile(repos, sub, asset, { name, sizeBytes: buffer.length, contentHash: ContentLibraryHelper.sha256(buffer) }, uploadedBy);
  }

  static async removeFile(repos: Repos, sub: Submission, asset: Asset, name: string): Promise<void> {
    const row = await repos.assetFile.loadOne(asset.id || "", name, sub.id || null);
    if (row) await repos.assetFile.delete(row.id || "");
    await ContentLibraryHelper.removeKey(ContentLibraryHelper.pendingKey(sub.id || "", name));
  }

  /** draft → pending: registry validation, upload presence, duplicate hash, rate limits, triage score, 409 on a competing pending submission. */
  static async submit(repos: Repos, sub: Submission, asset: Asset): Promise<Outcome<{ status: string }>> {
    if (sub.status !== "draft") return fail(400, "only drafts can be submitted");
    const def = ASSET_TYPES[asset.assetType || ""];
    if (!def) return fail(400, "unknown asset type");
    const proposed = await repos.assetFile.loadBySubmission(sub.id || "");
    const live = await repos.assetFile.loadLive(asset.id || "");
    const error = validateSubmission(def, sub.payload || {}, proposed, live);
    if (error) return fail(400, error);
    for (const f of proposed) {
      if (f.action !== "remove" && !(await ContentLibraryHelper.exists(ContentLibraryHelper.pendingKey(sub.id || "", f.name || "")))) return fail(400, `${f.name} was not uploaded`);
    }
    const primary = proposed.find((f) => f.action !== "remove" && def.files.find((s) => s.required && s.role === fileRole(f.name || "")));
    if (primary?.contentHash) {
      const dup = await repos.assetFile.loadLiveByHash(primary.contentHash);
      if (dup && dup.assetId !== asset.id) return fail(409, "an identical file has already been published");
    }
    const userId = sub.submittedBy || "";
    if ((await repos.submission.countByUser(userId, "pending")) >= MAX_PENDING_PER_USER) return fail(429, `you already have ${MAX_PENDING_PER_USER} submissions waiting for review`);
    if ((await repos.submission.countSubmittedSince(userId, new Date(Date.now() - 86400000))) >= MAX_SUBMITTED_PER_DAY) return fail(429, "daily submission limit reached");

    let triageScore: number | null = null;
    if (asset.assetType === "song") {
      const d = sub.payload?.detail || {};
      // must await: Lambda freezes after the response, fire-and-forget never completes
      const scored = await QualityHelper.score({ id: asset.id, title: sub.payload?.name, writer: d.writer, chordPro: d.chordPro, scripture: d.scripture, themes: sub.payload?.tags, bpm: d.bpm, songKey: d.songKey, fileRoles: resultingFileNames(live, proposed).map((n) => fileRole(n)) });
      triageScore = scored.qualityScore ?? null;
    }
    const moved = await repos.submission.submit(sub.id || "", asset.id || "", triageScore);
    if (!moved) {
      const pending = await repos.submission.loadPendingForAsset(asset.id || "");
      if (pending) return fail(409, `an edit by another contributor is already under review (${pending.id})`);
      return fail(400, "submission is no longer a draft");
    }
    return { ok: true, value: { status: "pending" } };
  }
}
