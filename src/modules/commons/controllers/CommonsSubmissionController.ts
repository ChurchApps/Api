import { controller, httpDelete, httpGet, httpPost, httpPut } from "inversify-express-utils";
import express from "express";
import * as fs from "fs";
import { ASSET_TYPES } from "@churchapps/helpers";
import { CommonsBaseController } from "./CommonsBaseController.js";
import { Permissions } from "../../../shared/helpers/index.js";
import { ContentLibraryHelper, PublishHelper, SubmissionHelper, userNames, fileSpec, INLINE_MAX_BYTES, DEFAULT_MAX_FILE_BYTES, type Outcome } from "../helpers/index.js";
import { Asset, AssetFile, Submission, SubmissionPayload } from "../models/index.js";

@controller("/commons/submissions")
export class CommonsSubmissionController extends CommonsBaseController {
  // authz-exempt: au.id required and ownership enforced in own()
  @httpPost("/")
  public async create(req: express.Request<{}, {}, { assetId?: string; assetType?: string; payload?: SubmissionPayload; note?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.id) return this.json({ errors: ["Sign in required"] }, 401);
      const result = await SubmissionHelper.createDraft(this.repos, au, req.body || {});
      if (result.ok === false) return this.json({ errors: result.errors || [result.error] }, result.status);
      return { submissionId: result.value.submission.id, assetId: result.value.asset.id, status: "draft" };
    });
  }

  @httpGet("/mine")
  public async mine(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.id) return this.json({ errors: ["Sign in required"] }, 401);
      const rows = await this.repos.submission.loadMine(au.id, req.query.status?.toString());
      return rows.map((r) => ({ ...r, isNewAsset: !r.publishedSubmissionId || r.publishedSubmissionId === r.id, isThirdParty: r.publisherUserId !== r.submittedBy }));
    });
  }

  // token-gated rather than JWT-gated: the product preview iframe B1Admin embeds carries no session
  @httpGet("/:id/preview")
  public async preview(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const id = String(req.params.id);
      if (!ContentLibraryHelper.verifyPreviewToken(id, String(req.query.token || ""))) return this.json({}, 404);
      const sub = await this.repos.submission.loadById(id);
      if (!sub) return this.json({}, 404);
      const asset = await this.repos.asset.loadById(sub.assetId || "");
      return await this.detail(sub, asset, ContentLibraryHelper.requestApiBase(req));
    });
  }

  @httpGet("/:id")
  public async get(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { sub, asset, error } = await this.own(au, String(req.params.id));
      if (error) return error;
      return await this.detail(sub, asset, ContentLibraryHelper.requestApiBase(req));
    });
  }

  // authz-exempt: au.id required and ownership enforced in own()
  @httpPut("/:id")
  public async update(req: express.Request<{ id: string }, {}, { payload?: SubmissionPayload; note?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { sub, error } = await this.own(au, String(req.params.id), "draft");
      if (error) return error;
      await this.repos.submission.update(sub.id || "", { payload: req.body.payload || sub.payload, note: req.body.note?.slice(0, 500) ?? sub.note });
      return this.json({}, 204);
    });
  }

  // authz-exempt: au.id required and ownership enforced in own()
  @httpPost("/:id/postUrl")
  public async postUrl(req: express.Request<{ id: string }, {}, { name: string; contentType?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { sub, asset, error } = await this.own(au, String(req.params.id), "draft");
      if (error) return error;
      const def = ASSET_TYPES[asset.assetType || ""];
      const name = String(req.body.name || "");
      const spec = def && fileSpec(def, name);
      if (!spec || spec.generated) return this.json({ errors: [`${name} is not an accepted file for ${def?.label || asset.assetType}`] }, 400);
      const contentType = req.body.contentType || ContentLibraryHelper.contentTypeFor(name);
      return await ContentLibraryHelper.presignedUpload(sub.id || "", name, contentType, spec.maxBytes || DEFAULT_MAX_FILE_BYTES, ContentLibraryHelper.requestApiBase(req));
    });
  }

  // disk-store counterpart of the S3 presigned POST: same multipart form shape, so clients have one upload path
  // authz-exempt: au.id required and ownership enforced in own()
  @httpPost("/:id/upload/:name")
  public async upload(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { sub, asset, error } = await this.own(au, String(req.params.id), "draft");
      if (error) return error;
      const file: any = (req as any).files?.file;
      if (!file) return this.json({ errors: ["file is required"] }, 400);
      const buffer: Buffer = file.data?.length ? file.data : fs.readFileSync(file.tempFilePath);
      const result = await SubmissionHelper.storeInline(this.repos, sub, asset, String(req.params.name), file.mimetype, buffer, au.id);
      if (result.ok === false) return this.json({ errors: result.errors || [result.error] }, result.status);
      return result.value;
    });
  }

  // authz-exempt: au.id required and ownership enforced in own()
  @httpPost("/:id/files")
  public async addFile(req: express.Request<{ id: string }, {}, { name: string; sizeBytes?: number; contentHash?: string; action?: string; contentType?: string; base64?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { sub, asset, error } = await this.own(au, String(req.params.id), "draft");
      if (error) return error;
      const b = req.body;
      let result: Outcome<AssetFile>;
      if (b.base64) {
        const buffer = Buffer.from(b.base64, "base64");
        if (buffer.length > INLINE_MAX_BYTES) return this.json({ errors: ["inline files are limited to 1MB — use postUrl"] }, 400);
        result = await SubmissionHelper.storeInline(this.repos, sub, asset, String(b.name || ""), b.contentType || "", buffer, au.id);
      } else {
        result = await SubmissionHelper.recordFile(this.repos, sub, asset, { name: String(b.name || ""), sizeBytes: Number(b.sizeBytes) || undefined, contentHash: b.contentHash, action: b.action }, au.id);
      }
      if (result.ok === false) return this.json({ errors: result.errors || [result.error] }, result.status);
      return result.value;
    });
  }

  // authz-exempt: au.id required and ownership enforced in own()
  @httpDelete("/:id/files/:name")
  public async removeFile(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { sub, asset, error } = await this.own(au, String(req.params.id), "draft");
      if (error) return error;
      await SubmissionHelper.removeFile(this.repos, sub, asset, String(req.params.name));
      return this.json({}, 204);
    });
  }

  // authz-exempt: au.id required and ownership enforced in own()
  @httpPost("/:id/submit")
  public async submit(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { sub, asset, error } = await this.own(au, String(req.params.id), "draft");
      if (error) return error;
      const result = await SubmissionHelper.submit(this.repos, sub, asset);
      if (result.ok === false) {
        const errors = result.errors || [result.error];
        return this.json({ errors }, result.status);
      }
      return result.value;
    });
  }

  // authz-exempt: au.id required and ownership enforced in own()
  @httpPost("/:id/withdraw")
  public async withdraw(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { sub, error } = await this.own(au, String(req.params.id), "pending");
      if (error) return error;
      await this.repos.submission.update(sub.id || "", { status: "draft" });
      return { status: "draft" };
    });
  }

  // authz-exempt: au.id required and ownership enforced in own()
  @httpDelete("/:id")
  public async delete(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      const { sub, asset, error } = await this.own(au, String(req.params.id), "draft");
      if (error) return error;
      await PublishHelper.discardProposed(this.repos, sub, asset, true);
      return this.json({}, 204);
    });
  }

  private async own(au: { id?: string; checkAccess: (p: any) => boolean }, id: string, status?: string): Promise<{ sub: Submission; asset: Asset; error?: any }> {
    if (!au.id) return { sub: null as any, asset: null as any, error: this.json({ errors: ["Sign in required"] }, 401) };
    const sub = await this.repos.submission.loadById(id);
    if (!sub) return { sub: null as any, asset: null as any, error: this.json({}, 404) };
    if (sub.submittedBy !== au.id && !au.checkAccess(Permissions.server.admin)) return { sub, asset: null as any, error: this.json({}, 404) };
    if (status && sub.status !== status) return { sub, asset: null as any, error: this.json({ errors: [`submission is ${sub.status}, not ${status}`] }, 400) };
    const asset = await this.repos.asset.loadById(sub.assetId || "");
    if (!asset) return { sub, asset: null as any, error: this.json({}, 404) };
    return { sub, asset };
  }

  private async detail(sub: Submission, asset: Asset | undefined, apiBase: string) {
    const files = await this.repos.assetFile.loadBySubmission(sub.id || "");
    const withUrls: (AssetFile & { url?: string })[] = [];
    for (const f of files) withUrls.push({ ...f, url: f.action === "remove" ? undefined : await ContentLibraryHelper.signedPendingUrl(sub.id || "", f.name || "", apiBase) });
    const liveFiles = asset ? await this.repos.assetFile.loadLive(asset.id || "") : [];
    const names = await userNames([sub.submittedBy, asset?.publisherUserId]);
    return {
      ...sub,
      submittedByName: names[sub.submittedBy || ""],
      assetType: asset?.assetType,
      assetName: asset?.name,
      assetStatus: asset?.status,
      isNewAsset: !asset?.publishedSubmissionId,
      isThirdParty: !!asset && asset.publisherUserId !== sub.submittedBy,
      files: withUrls,
      live: asset ? { ...asset, publisherName: names[asset.publisherUserId || ""], fileUrls: ContentLibraryHelper.fileUrls(asset, liveFiles), files: liveFiles, payload: await PublishHelper.editablePayload(this.repos, asset) } : null
    };
  }
}
