import { Song, SongView } from "../../models/index.js";
import { ContentLibraryHelper } from "../ContentLibraryHelper.js";
import type { PublishHook } from "./index.js";

const SONG_FIELDS = [
  "year", "songKey", "bpm", "timeSignature", "meter", "scripture", "scriptureText", "chordPro", "videoUrl", "parentSongId", "relationLabel", "proAnswer"
] as const;

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
    const writers = writer.split(/\s*(?:,|&| and )\s*/i).map((n) => n.trim()).filter(Boolean);
    for (let i = 0; i < writers.length; i++) {
      const id = await repos.author.findOrCreate(writers[i]);
      if (i === 0) song.authorId = id;
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
