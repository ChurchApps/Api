import { controller, httpDelete, httpGet, httpPost } from "inversify-express-utils";
import express from "express";
import { CommonsBaseController } from "./CommonsBaseController.js";
import { ChordProHelper, ContentLibraryHelper, QualityHelper, demoOwnershipMissing, ipHash, MAX_FILE_BYTES } from "../helpers/index.js";
import { Repos } from "../repositories/index.js";
import { Song } from "../models/index.js";

interface UploadedFile { name: string; contentType: string; base64: string; }
interface SongSubmission extends Song {
  recordingOwned?: boolean;
  demoOwned?: boolean;
  files?: { demoAudio?: UploadedFile; sheetPdf?: UploadedFile; stemsZip?: UploadedFile };
}

@controller("/commons/songs")
export class CommonsSongController extends CommonsBaseController {
  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => await this.repos.song.loadApprovedSummaries());
  }

  @httpGet("/mine")
  public async mine(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.id) return this.json({ errors: ["Sign in required"] }, 401);
      return await this.repos.song.loadBySubmitter(au.id);
    });
  }

  @httpGet("/library")
  public async library(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.id) return this.json({ errors: ["Sign in required"] }, 401);
      return await this.repos.song.loadLibraryIds(au.id);
    });
  }

  // authz-exempt: the library is keyed by au.id, so a signed-in user can only touch their own
  @httpPost("/:id/library")
  public async addToLibrary(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.id) return this.json({ errors: ["Sign in required"] }, 401);
      const song = await this.repos.song.loadById(String(req.params.id));
      if (!song || song.status !== "approved") return this.json({}, 404);
      const added = await this.repos.song.addToLibrary(au.id, song.id);
      // a save counts toward churchCount once per user and, like /sing, never decrements â€” removing it later doesn't unsing it
      const churchCount = added ? await this.repos.song.incrementChurchCount(song.id) : song.churchCount;
      return { inLibrary: true, churchCount };
    });
  }

  // authz-exempt: the library is keyed by au.id, so a signed-in user can only touch their own
  @httpDelete("/:id/library")
  public async removeFromLibrary(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.id) return this.json({ errors: ["Sign in required"] }, 401);
      await this.repos.song.removeFromLibrary(au.id, String(req.params.id));
      return { inLibrary: false };
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
      // no server-side notation validation â€” the editor shows warnings and an admin re-renders on review
      const sub = await this.repos.abcSubmission.create({ songId: song.id, abc, submittedBy: au.id });
      return { id: sub.id, status: "pending" };
    });
  }

  @httpGet("/:id")
  public async get(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const song = await this.repos.song.loadById(String(req.params.id));
      if (!song || song.status !== "approved") return this.json({}, 404);
      const { proAnswer: _proAnswer, qualityDetail: _qualityDetail, submittedBy: _submittedBy, ...pub } = song as any;
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

  @httpPost("/:id/sing")
  public async sing(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const song = await this.repos.song.loadById(String(req.params.id));
      if (!song || song.status !== "approved") return this.json({}, 404);
      // ponytail: IP-hash dedupe â€” NAT'd churches share an IP, so this undercounts slightly; fine for an honesty-first metric
      const counted = await this.repos.song.recordSing(song.id, ipHash(req));
      const churchCount = counted ? await this.repos.song.incrementChurchCount(song.id) : song.churchCount;
      return { churchCount };
    });
  }

  @httpPost("/")
  public async submit(req: express.Request<{}, {}, SongSubmission>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.id) return this.json({ errors: ["Sign in to share a song"] }, 401);
      const body = req.body;
      if (!body.title || !body.chordPro || !body.certified) return this.json({ errors: ["title, chordPro and certification are required"] }, 400);
      if (demoOwnershipMissing(body)) return this.json({ errors: ["recording ownership confirmation is required when attaching a demo"] }, 400);
      body.chordPro = body.chordPro.replace(/\r\n/g, "\n"); // library files are LF; body must roundtrip byte-identical

      const song: Song = {
        title: body.title,
        writer: body.writer,
        year: body.year,
        themes: body.themes,
        songKey: body.songKey,
        bpm: body.bpm,
        timeSignature: body.timeSignature || "4/4",
        language: body.language || "English",
        scripture: body.scripture,
        license: body.license === "PD" ? "PD" : "WC",
        chordPro: body.chordPro,
        status: "pending",
        submittedBy: au.id,
        proAnswer: body.proAnswer,
        certified: true
      };
      await this.repos.song.create(song);

      const files: { field: string; file?: UploadedFile; urlCol: keyof Song; bytesCol: keyof Song }[] = [
        { field: "demoAudio", file: body.files?.demoAudio, urlCol: "demoAudioUrl", bytesCol: "demoAudioBytes" },
        { field: "sheetPdf", file: body.files?.sheetPdf, urlCol: "sheetPdfUrl", bytesCol: "sheetPdfBytes" },
        { field: "stemsZip", file: body.files?.stemsZip, urlCol: "stemsZipUrl", bytesCol: "stemsZipBytes" }
      ];
      const updates: Partial<Song> = {};
      for (const f of files) {
        if (!f.file?.base64) continue;
        const buffer = Buffer.from(f.file.base64, "base64");
        if (buffer.length === 0 || buffer.length > MAX_FILE_BYTES) continue;
        const safeName = (f.file.name || f.field).replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `${ContentLibraryHelper.pendingFolderKey(song)}/${safeName}`;
        await ContentLibraryHelper.storePending(key, f.file.contentType || "application/octet-stream", buffer);
        (updates as any)[f.urlCol] = key;
        (updates as any)[f.bytesCol] = buffer.length;
      }
      if (Object.keys(updates).length > 0) await this.repos.song.update(song.id, updates);

      // must await: Lambda freezes after the response, fire-and-forget never completes
      const scoreFields = await QualityHelper.score({ ...song, ...updates });
      if (scoreFields.qualityScore != null) await this.repos.song.update(song.id, scoreFields);

      return { ...song, ...updates, ...scoreFields };
    });
  }

  private async download(req: express.Request, res: express.Response, ext: string, convert: (song: Song) => string): Promise<any> {
    const repos = await this.getRepos<Repos>();
    const song = await repos.song.loadById(String(req.params.id));
    if (!song || song.status !== "approved") {
      res.status(404).json({});
      return;
    }
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${ChordProHelper.slug(song.title)}.${ext}"`);
    res.send(convert(song));
  }
}
