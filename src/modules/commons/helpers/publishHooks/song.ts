import { Song, SongView } from "../../models/index.js";
import { ContentLibraryHelper } from "../ContentLibraryHelper.js";
import type { PublishHook } from "./index.js";

const SONG_FIELDS = [
  "year", "songKey", "bpm", "timeSignature", "meter", "scripture", "scriptureText", "chordPro", "videoUrl", "parentSongId", "relationLabel", "proAnswer"
] as const;

// the exact license an upload is released under; WC/PD notices need no URL beyond the site itself
const LICENSE_URLS: Record<string, string> = { "CC-BY": "https://creativecommons.org/licenses/by/4.0/" };

// The one type with a satellite: WorshipCommons facets on key/tempo/scripture, and the content
// repo export reads song.json + lyrics.chordpro from the asset folder.
export const songPublishHook: PublishHook = {
  async onPublish(ctx) {
    const { asset, detail, repos } = ctx;
    const existing = await repos.song.loadSatellite(asset.id || "");
    const writer = typeof detail.writer === "string" ? detail.writer.trim() : "";
    const song: Song = { assetId: asset.id, hymnalCount: existing?.hymnalCount || 0, certified: true };
    for (const k of SONG_FIELDS) if (detail[k] !== undefined) (song as any)[k] = detail[k] === "" ? null : detail[k];
    if (song.chordPro) song.chordPro = String(song.chordPro).replace(/\r\n/g, "\n"); // library files are LF
    // the notice on the song page, print chart and zip names this exact version and URL
    const licenseVersion = ctx.submission.payload?.licenseVersion || existing?.licenseVersion;
    if (licenseVersion) song.licenseVersion = licenseVersion;
    const licenseUrl = LICENSE_URLS[asset.license || ""] || existing?.licenseUrl;
    if (licenseUrl) song.licenseUrl = licenseUrl;
    const writers = writer.split(/\s*(?:,|&| and )\s*/i).map((n) => n.trim()).filter(Boolean);
    for (let i = 0; i < writers.length; i++) {
      const id = await repos.author.findOrCreate(writers[i]);
      if (i === 0) song.authorId = id;
    }
    // A song credited to exactly one writer claims that author row for the submitter, so they can
    // edit their own bio and links. Co-written songs stay unclaimed — we cannot tell whose row it is.
    const submittedBy = ctx.submission.submittedBy;
    if (writers.length === 1 && submittedBy && song.authorId) {
      const author = await repos.author.loadById(song.authorId);
      if (author && !author.userId) await repos.author.update(song.authorId, { userId: submittedBy });
    }
    if (ctx.submission.triageScore != null) song.qualityScore = ctx.submission.triageScore;
    const qd = ctx.submission.payload?.qualityDetail;
    if (qd) song.qualityDetail = typeof qd === "string" ? qd : JSON.stringify(qd);
    await repos.song.upsert(song);

    const view = (await repos.song.loadById(asset.id || "")) as SongView;
    await ctx.writeFile("song.json", "application/json", Buffer.from(JSON.stringify(ContentLibraryHelper.songJson(view, ctx.files), null, 2) + "\n"));
    await ctx.writeFile("lyrics.chordpro", "text/plain; charset=utf-8", Buffer.from(ContentLibraryHelper.renderChordpro(view)));
  }
};
