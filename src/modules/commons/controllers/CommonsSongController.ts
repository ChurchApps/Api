import { controller, httpDelete, httpGet, httpPost } from "inversify-express-utils";
import express from "express";
import { CommonsBaseController } from "./CommonsBaseController.js";
import { ChordProHelper, ContentLibraryHelper, QualityHelper, demoOwnershipMissing, MAX_FILE_BYTES, recordAssetDownload } from "../helpers/index.js";
import { Repos } from "../repositories/index.js";
import { Asset, Song, SongView } from "../models/index.js";

interface UploadedFile { name: string; contentType: string; base64: string; }
// the wire "files" field carries upload payloads; SongView.files (the stored name list) is server-set
interface SongSubmission extends Omit<SongView, "files"> {
  recordingOwned?: boolean;
  demoOwned?: boolean;
  files?: { demoAudio?: UploadedFile; sheetPdf?: UploadedFile; stemsZip?: UploadedFile };
}

@controller("/commons/songs")
export class CommonsSongController extends CommonsBaseController {
  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => (await this.repos.song.loadApprovedSummaries()).map((s) => ContentLibraryHelper.withUrls(s)));
  }

  @httpGet("/mine")
  public async mine(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.id) return this.json({ errors: ["Sign in required"] }, 401);
      return (await this.repos.song.loadBySubmitter(au.id)).map((s) => ContentLibraryHelper.withUrls(s));
    });
  }

  // the library is the caller's likes on song-type assets
  @httpGet("/library")
  public async library(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.id) return this.json({ errors: ["Sign in required"] }, 401);
      return (await this.repos.song.loadLiked(au.id)).map((s) => ContentLibraryHelper.withUrls(s));
    });
  }

  // authz-exempt: the library is keyed by au.id, so a signed-in user can only touch their own
  @httpPost("/:id/library")
  public async addToLibrary(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.id) return this.json({ errors: ["Sign in required"] }, 401);
      const asset = await this.repos.asset.loadApproved(String(req.params.id));
      if (!asset || asset.assetType !== "song") return this.json({}, 404);
      const { likeCount } = await this.repos.asset.setLike(asset.id, au.id, true);
      return { inLibrary: true, likeCount };
    });
  }

  // authz-exempt: the library is keyed by au.id, so a signed-in user can only touch their own
  @httpDelete("/:id/library")
  public async removeFromLibrary(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.id) return this.json({ errors: ["Sign in required"] }, 401);
      const { likeCount } = await this.repos.asset.setLike(String(req.params.id), au.id, false);
      return { inLibrary: false, likeCount };
    });
  }

  @httpPost("/:id/abc")
  public async submitAbc(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.id) return this.json({ errors: ["Sign in required"] }, 401);
      const song = await this.repos.song.loadById(String(req.params.id));
      if (!song || song.status !== "approved") return this.json({}, 404);
      const abc = typeof req.body?.abc === "string" ? req.body.abc.trim() : "";
      if (!abc || abc.length > 100000) return this.json({ errors: ["abc text is required (max 100KB)"] }, 400);
      // no server-side notation validation — the editor shows warnings and an admin re-renders on review
      const sub = await this.repos.abcSubmission.create({ songId: song.id, abc, submittedBy: au.id });
      return { id: sub.id, status: "pending" };
    });
  }

  @httpGet("/:id")
  public async get(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const song = await this.repos.song.loadById(String(req.params.id));
      if (!song || song.status !== "approved") return this.json({}, 404);
      const { proAnswer: _proAnswer, qualityDetail: _qualityDetail, submittedBy: _submittedBy, ...pub } = ContentLibraryHelper.withUrls(song) as any;
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

  @httpPost("/")
  public async submit(req: express.Request<{}, {}, SongSubmission>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.id) return this.json({ errors: ["Sign in to share a song"] }, 401);
      const body = req.body;
      if (!body.title || !body.chordPro || !body.certified) return this.json({ errors: ["title, chordPro and certification are required"] }, 400);
      if (demoOwnershipMissing(body)) return this.json({ errors: ["recording ownership confirmation is required when attaching a demo"] }, 400);
      body.chordPro = body.chordPro.replace(/\r\n/g, "\n"); // library files are LF; body must roundtrip byte-identical

      const asset: Asset = {
        assetType: "song",
        name: body.title,
        tags: body.themes,
        language: body.language || "English",
        license: body.license === "PD" ? "PD" : "WC",
        publisherUserId: au.id,
        publisherChurchId: au.churchId,
        status: "pending"
      };
      await this.repos.asset.create(asset);

      const writer = body.writer?.trim();
      const song: Song = {
        assetId: asset.id,
        authorId: writer ? await this.repos.author.findOrCreate(writer) : undefined,
        year: body.year,
        songKey: body.songKey,
        bpm: body.bpm,
        timeSignature: body.timeSignature || "4/4",
        scripture: body.scripture,
        chordPro: body.chordPro,
        proAnswer: body.proAnswer,
        certified: true
      };
      await this.repos.song.create(song);

      const view: SongView = {
        ...song,
        id: asset.id,
        title: asset.name,
        themes: asset.tags,
        language: asset.language,
        license: asset.license,
        status: asset.status,
        submittedBy: asset.publisherUserId,
        writer,
        downloadCount: 0,
        likeCount: 0
      };

      const uploads: [string, UploadedFile | undefined, string][] = [
        ["demoAudio", body.files?.demoAudio, "mp3"],
        ["sheetPdf", body.files?.sheetPdf, "pdf"],
        ["stemsZip", body.files?.stemsZip, "zip"]
      ];
      const pendingFolder = ContentLibraryHelper.pendingFolderKey(view);
      const names: string[] = [];
      for (const [field, file, defaultExt] of uploads) {
        if (!file?.base64) continue;
        const buffer = Buffer.from(file.base64, "base64");
        if (buffer.length === 0 || buffer.length > MAX_FILE_BYTES) continue;
        const ext = (file.name?.includes(".") ? file.name.split(".").pop() || "" : "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || defaultExt;
        const name = `${field}.${ext}`;
        await ContentLibraryHelper.storePending(`${pendingFolder}/${name}`, file.contentType || "application/octet-stream", buffer);
        names.push(name);
      }
      const spineUpdates: Partial<Asset> = { path: pendingFolder, files: names.length ? names.join(",") : undefined };
      await this.repos.asset.update(asset.id, spineUpdates);

      // must await: Lambda freezes after the response, fire-and-forget never completes
      const scoreFields = await QualityHelper.score({ ...view, ...spineUpdates });
      if (scoreFields.qualityScore != null) await this.repos.song.update(view.id, scoreFields);

      return { ...view, ...spineUpdates, ...scoreFields };
    });
  }

  private async download(req: express.Request, res: express.Response, ext: string, convert: (song: SongView) => string): Promise<any> {
    const repos = await this.getRepos<Repos>();
    const song = await repos.song.loadById(String(req.params.id));
    if (!song || song.status !== "approved") {
      res.status(404).json({});
      return;
    }
    await recordAssetDownload(repos.asset, { id: song.id, downloadCount: song.downloadCount }, req);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${ChordProHelper.slug(song.title)}.${ext}"`);
    res.send(convert(song));
  }
}
