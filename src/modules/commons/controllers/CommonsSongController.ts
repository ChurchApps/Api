import { controller, httpDelete, httpGet, httpPost } from "inversify-express-utils";
import express from "express";
import { CommonsBaseController } from "./CommonsBaseController.js";
import { ChordProHelper, ContentLibraryHelper, DuplicateHelper, recordAssetDownload, SubmissionHelper } from "../helpers/index.js";
import { Repos } from "../repositories/index.js";
import { SongView } from "../models/index.js";

interface UploadedFile { name: string; contentType: string; base64: string; }
interface LegacySongSubmission {
  title?: string;
  writer?: string;
  year?: number;
  songKey?: string;
  bpm?: number;
  timeSignature?: string;
  themes?: string;
  language?: string;
  scripture?: string;
  chordPro?: string;
  license?: string;
  proAnswer?: string;
  certified?: boolean;
  recordingOwned?: boolean;
  demoOwned?: boolean;
  files?: { demoAudio?: UploadedFile; sheetPdf?: UploadedFile; stemsZip?: UploadedFile };
}

// Read side stays a thin projection over assets ⋈ songs ⋈ authors so the WorshipCommons site
// keeps its vocabulary. The write endpoints below are shims onto submissions for the site
// version that predates the submissions cutover; delete them once that site no longer calls them.
@controller("/commons/songs")
export class CommonsSongController extends CommonsBaseController {
  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => await this.withUrls(await this.repos.song.loadPublishedSummaries()));
  }

  // public: a writer about to submit deserves to know the song is already here, before signing in
  @httpGet("/similar")
  public async similar(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const query = { title: String(req.query.title || ""), writer: String(req.query.writer || ""), firstLine: String(req.query.firstLine || "") };
      if (!query.title.trim() && !query.firstLine.trim()) return [];
      return DuplicateHelper.matches(query, await this.repos.song.loadPublishedForDuplicates());
    });
  }

  @httpGet("/mine")
  public async mine(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAuth(req, res, async (au) => {
      return await this.withUrls(await this.repos.song.loadBySubmitter(au.id));
    });
  }

  // shim: the saved library is now GET /commons/assets/saved
  @httpGet("/library")
  public async library(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAuth(req, res, async (au) => {
      return await this.withUrls(await this.repos.song.loadSaved(au.id));
    });
  }

  // shim: PUT /commons/assets/:id/saved — authz-exempt, keyed by au.id
  @httpPost("/:id/library")
  public async addToLibrary(req: express.Request, res: express.Response): Promise<any> {
    return this.setSaved(req, res, true);
  }

  // shim: PUT /commons/assets/:id/saved — authz-exempt, keyed by au.id
  @httpDelete("/:id/library")
  public async removeFromLibrary(req: express.Request, res: express.Response): Promise<any> {
    return this.setSaved(req, res, false);
  }

  // shim: a transcription is a submission carrying one tune.abc file
  // authz-exempt: au.id required; rows are created for the caller only
  @httpPost("/:id/abc")
  public async submitAbc(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAuth(req, res, async (au) => {
      const asset = await this.repos.asset.loadPublished(String(req.params.id));
      if (!asset || asset.assetType !== "song") return this.json({}, 404);
      const abc = typeof req.body?.abc === "string" ? req.body.abc.trim() : "";
      if (!abc || abc.length > 100000) return this.json({ errors: ["abc text is required (max 100KB)"] }, 400);
      const payload = await this.editable(asset.id || "");
      const draft = await SubmissionHelper.createDraft(this.repos, au, { assetId: asset.id, payload, note: "ABC transcription" });
      if (draft.ok === false) return this.json({ errors: draft.errors || [draft.error] }, draft.status);
      const stored = await SubmissionHelper.storeInline(this.repos, draft.value.submission, asset, "tune.abc", "text/plain; charset=utf-8", Buffer.from(abc), au.id);
      if (stored.ok === false) return this.json({ errors: stored.errors || [stored.error] }, stored.status);
      const result = await SubmissionHelper.submit(this.repos, draft.value.submission, asset);
      if (result.ok === false) {
        const errors = result.errors || [result.error];
        return this.json({ errors }, result.status);
      }
      return { id: draft.value.submission.id, status: "pending" };
    });
  }

  @httpGet("/:id")
  public async get(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const song = await this.repos.song.loadById(String(req.params.id));
      if (!song || song.status !== "published") return this.json({}, 404);
      const [view] = await this.withUrls([song]);
      const { proAnswer: _proAnswer, qualityScore: _qualityScore, qualityDetail: _qualityDetail, submittedBy: _submittedBy, ...pub } = view as any;
      return pub;
    });
  }

  @httpGet("/:id/chordpro")
  public async chordpro(req: express.Request, res: express.Response): Promise<any> {
    return this.download(req, res, "cho", ChordProHelper.toCho);
  }

  @httpGet("/:id/lyrics")
  public async lyrics(req: express.Request, res: express.Response): Promise<any> {
    return this.download(req, res, "txt", ChordProHelper.toLyrics);
  }

  // shim: the one-shot upload becomes draft → inline files → submit
  // authz-exempt: au.id required; rows are created for the caller only
  @httpPost("/")
  public async submit(req: express.Request<{}, {}, LegacySongSubmission>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.id) return this.json({ errors: ["Sign in to share a song"] }, 401);
      const body = req.body;
      if (!body.title || !body.chordPro || !body.certified) return this.json({ errors: ["title, chordPro and certification are required"] }, 400);
      const payload = {
        name: body.title,
        tags: body.themes,
        language: body.language || "English",
        license: body.license === "PD" ? "PD" : "WC",
        detail: {
          writer: body.writer,
          year: body.year,
          songKey: body.songKey,
          bpm: body.bpm,
          timeSignature: body.timeSignature || "4/4",
          scripture: body.scripture,
          chordPro: body.chordPro,
          proAnswer: body.proAnswer,
          certified: true,
          recordingOwned: !!(body.recordingOwned || body.demoOwned)
        }
      };
      const draft = await SubmissionHelper.createDraft(this.repos, au, { assetType: "song", payload });
      if (draft.ok === false) return this.json({ errors: draft.errors || [draft.error] }, draft.status);
      const { submission, asset } = draft.value;
      const uploads: [string, UploadedFile | undefined, string][] = [["demoAudio", body.files?.demoAudio, "mp3"], ["sheetPdf", body.files?.sheetPdf, "pdf"], ["stemsZip", body.files?.stemsZip, "zip"]];
      for (const [field, file, defaultExt] of uploads) {
        if (!file?.base64) continue;
        const ext = (file.name?.includes(".") ? file.name.split(".").pop() || "" : "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || defaultExt;
        const stored = await SubmissionHelper.storeInline(this.repos, submission, asset, `${field}.${ext}`, file.contentType, Buffer.from(file.base64, "base64"), au.id);
        if (stored.ok === false) return this.json({ errors: stored.errors || [stored.error] }, stored.status);
      }
      const result = await SubmissionHelper.submit(this.repos, submission, asset);
      if (result.ok === false) {
        await this.repos.submission.delete(submission.id || "");
        await this.repos.assetFile.deleteBySubmission(submission.id || "");
        await this.repos.asset.delete(asset.id || "");
        const errors = result.errors || [result.error];
        return this.json({ errors }, result.status);
      }
      return { id: asset.id, submissionId: submission.id, title: asset.name, status: "pending" };
    });
  }

  private setSaved(req: express.Request, res: express.Response, saved: boolean) {
    return this.actionWrapperAuth(req, res, async (au) => {
      const asset = await this.repos.asset.loadPublished(String(req.params.id));
      if (!asset || asset.assetType !== "song") return this.json({}, 404);
      await this.repos.rating.setSaved(asset.id || "", au.id, saved);
      return { inLibrary: saved };
    });
  }

  private async editable(assetId: string) {
    const s = await this.repos.song.loadById(assetId);
    return { name: s?.title, tags: s?.themes, language: s?.language, license: s?.license, detail: { writer: s?.writer, year: s?.year, songKey: s?.songKey, bpm: s?.bpm, timeSignature: s?.timeSignature, scripture: s?.scripture, chordPro: s?.chordPro, certified: true } };
  }

  private async withUrls(songs: SongView[]): Promise<SongView[]> {
    const files = await this.repos.assetFile.loadLiveMany(songs.map((s) => s.id || ""));
    return songs.map((s) => {
      // qualityScore is reviewer-only: it never leaves an anonymous endpoint, only the opaque rank does
      const { portraitKey, qualityScore: _qualityScore, ...rest } = s;
      return { ...rest, fileUrls: ContentLibraryHelper.fileUrls({ assetType: "song", id: s.id }, files[s.id || ""] || [], portraitKey) };
    });
  }

  private async download(req: express.Request, res: express.Response, ext: string, convert: (song: SongView) => string): Promise<any> {
    const repos = await this.getRepos<Repos>();
    const song = await repos.song.loadById(String(req.params.id));
    if (!song || song.status !== "published") {
      res.status(404).json({});
      return;
    }
    await recordAssetDownload(repos.asset, { id: song.id, downloadCount: song.downloadCount }, req);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${ChordProHelper.slug(song.title)}.${ext}"`);
    res.send(convert(song));
  }
}
