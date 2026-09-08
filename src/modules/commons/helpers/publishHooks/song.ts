import { Contributor, FormMap, RightsLayer, RightsMap, Song, SongView } from "../../models/index.js";
import { ContentLibraryHelper } from "../ContentLibraryHelper.js";
import { appendContributors, parseContributors } from "../ContributorsHelper.js";
import { baseName } from "../PackageLayout.js";
import { SongPackageHelper } from "../SongPackageHelper.js";
import { SUBMISSION_TYPE_LABELS, SubmissionType } from "../SubmitValidation.js";
import type { PublishContext, PublishHook } from "./index.js";

const SONG_FIELDS = [
  "year", "songKey", "bpm", "timeSignature", "meter", "scripture", "scriptureText", "chordPro", "videoUrl", "parentSongId", "relationLabel", "proAnswer"
] as const;

// the exact license an upload is released under; WC/PD notices need no URL beyond the site itself
const LICENSE_URLS: Record<string, string> = { "CC-BY": "https://creativecommons.org/licenses/by/4.0/" };

// a change to any of these invalidates the listen gate: what was heard is no longer what is served
const SCORE_FILES = /^(score\.musicxml|tune\.abc|tune\.mid|sheetPdf\.(xml|musicxml))$/;

const has = (names: string[], re: RegExp) => names.some((n) => re.test(n));

/** The submitter's credit line for this approval, plus the named translator / arranger when they differ. */
export function contributorRows(ctx: PublishContext): Contributor[] {
  const sub = ctx.submission;
  const type = (sub.type || "new") as SubmissionType;
  const at = new Date().toISOString();
  const rows: Contributor[] = [];
  if (ctx.submitterName) rows.push({ name: ctx.submitterName, what: SUBMISSION_TYPE_LABELS[type] || type, submissionId: sub.id, at });
  const named = type === "translation" ? ["translator", ctx.detail.translator] : type === "arrangement" ? ["arranger", ctx.detail.arranger] : null;
  if (named && typeof named[1] === "string" && named[1].trim() && named[1].trim() !== ctx.submitterName) rows.push({ name: named[1].trim(), what: named[0] as string, submissionId: sub.id, at });
  return rows;
}

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
    song.contributors = JSON.stringify(appendContributors(parseContributors(existing?.contributors), contributorRows(ctx)));
    Object.assign(song, packageFields(song, existing, asset.license || "", writer, ctx.files.map((f) => f.name || ""), (ctx.filesChanged || []).map((f) => f.name)));
    await repos.song.upsert(song);

    // the two masters a person is answerable for; the content repo export reads them from the package
    const view = (await repos.song.loadById(asset.id || "")) as SongView;
    await ctx.writeFile("masters/song.json", "application/json", Buffer.from(JSON.stringify(ContentLibraryHelper.songJson(view, ctx.files), null, 2) + "\n"));
    await ctx.writeFile("masters/lyrics.chordpro", "text/plain; charset=utf-8", Buffer.from(ContentLibraryHelper.renderChordpro(view)));
  }
};

/** The package-model columns a publish derives: confidence, first line, rights, form, keys, and the listen-gate invalidation. File names may carry their package folder; only the basename matters here. */
export function packageFields(song: Song, existing: Song | undefined, license: string, writer: string, liveNames: string[], changedNames: string[]): Partial<Song> {
  const fileNames = liveNames.map(baseName);
  const changed = changedNames.map(baseName);
  const chordPro = song.chordPro ?? existing?.chordPro ?? "";
  const lyricsChanged = !!existing && (existing.chordPro || "") !== chordPro;
  const scoreChanged = changed.some((n) => SCORE_FILES.test(n));
  const hasScore = fileNames.includes("score.musicxml");
  const hasChords = SongPackageHelper.hasChords(chordPro);
  // ponytail: no server-side abc2xml — a score.musicxml here was either seeded (scoreSource kept) or uploaded as a master
  const scoreSource = hasScore ? (changed.includes("score.musicxml") || !existing?.scoreSource ? "master" : existing.scoreSource) : null;
  const invalidated = lyricsChanged || scoreChanged;
  const base = SongPackageHelper.baseConfidence({ hasScore, scoreSource, hasChords });
  const out: Partial<Song> = {
    firstLine: SongPackageHelper.firstLine(chordPro),
    hasChords,
    scoreSource,
    confidence: !invalidated && existing?.confidence === "sunday-ready" ? "sunday-ready" : base,
    rights: JSON.stringify(rightsFor(SongPackageHelper.normalizeRights(existing?.rights), license, writer, fileNames)),
    form: JSON.stringify(formFor(SongPackageHelper.parseJson<FormMap>(existing?.form), chordPro, lyricsChanged)),
    publishedKeys: JSON.stringify(keysFor(SongPackageHelper.parseKeys(existing?.publishedKeys), song.songKey ?? existing?.songKey, song.recommendedKey ?? existing?.recommendedKey))
  };
  if (invalidated) Object.assign(out, { listenedKeys: null, sundayReadyBy: null, sundayReadyAt: null });
  return out;
}

// text/tune/arrangement follow the asset license with the writer as holder; a layer whose license did not
// change keeps its recorded basis/source; recording and artwork exist only while their file is served
function rightsFor(existing: RightsMap | null, license: string, writer: string, fileNames: string[]): RightsMap {
  const layer = (prev: RightsLayer | null | undefined): RightsLayer => prev && prev.license === license ? { holder: writer || undefined, ...prev } : { license, holder: writer || undefined };
  return {
    text: layer(existing?.text),
    translation: existing?.translation ?? null,
    tune: layer(existing?.tune),
    arrangement: layer(existing?.arrangement),
    recording: has(fileNames, /^demoAudio\./) ? layer(existing?.recording) : null,
    artwork: has(fileNames, /^(art\.|cover\.)/) ? layer(existing?.artwork) : null
  };
}

// an approved form survives a publish that left the lyrics alone; anything else is redrafted from the stanza labels
function formFor(existing: FormMap | null, chordPro: string, lyricsChanged: boolean): FormMap | null {
  if (existing?.status === "approved" && !lyricsChanged) return existing;
  return SongPackageHelper.draftForm(chordPro);
}

// [songKey] plus the recommended key; an existing list that still names the song key is a pin and wins
function keysFor(existing: string[], songKey?: string, recommendedKey?: string): string[] {
  if (songKey && existing.includes(songKey)) return existing;
  return [...new Set([songKey, recommendedKey].filter((k): k is string => !!k))];
}
