# Commons module — song packages

A song id is always the current song. There are no release ids: a republish rewrites the same id's files and rows, and the `/assets/:id/history` timeline is the only version record.

**Package layout in the bucket.** A song's live files sit under `commons/assets/song/<id>/` in the three folders of `vision/files.md` section 0; `manifest.json` (the inventory) stays at the package root. `assetFiles.name` stores the package-relative name (`sources/tune.mid`, `masters/lyrics.chordpro`, `derivatives/slides.json`); roles are always decided by the basename (`helpers/PackageLayout.ts`), so `fileUrls` keys are unchanged for consumers and only the URL path carries the folder. Pending uploads stay flat under `commons/pending/<submissionId>/`; `packagePath()` decides the destination folder on approve. Assets that are not songs keep their flat layout.

| Folder | What lands there | Written by |
|---|---|---|
| `sources/` | writer uploads (demo audio, stems, sheet PDF, MIDI, ABC, uploaded scores, ChordPro/lyrics text) and the repo's source files | seed, approve |
| `masters/` | `song.json`, `lyrics.chordpro`, `cover.webp`, `art.<ext>`, a proofread `score.musicxml` | seed, the song publish hook, approve (art) |
| `derivatives/` | `score.musicxml` (when derived), `slides.json`, `chart.chordpro`, `chart.pdf`, `attribution.txt`, `duration.json`, `cover-thumb.webp`, `timing.json`, `sources.txt` | seed (from the content pipeline); a browser-made `art-thumb.webp` is renamed to `derivatives/cover-thumb.webp` on approve |
| root | `manifest.json` — `files[].name` and `sources[].file` are package-relative | the manifest hook |

**Seed source of truth.** `tools/commons-seed/catalog.ts` builds the song row from the package: `masters/song.json` + `masters/lyrics.chordpro` (directive header stripped, body verbatim) + `sources/hymnary.json` (hymnal count) + `sources/video.json` (YouTube link) + `derivatives/duration.json` (sing time). `catalog.json` only supplies what the package lacks: ids, package paths, `confidence`, `parentSongId`, writer bio/portrait. Every package file is copied into the id-keyed live folder keeping its folder; files a song inherits from its work land under the song's own package. `masters/song.json` and `masters/lyrics.chordpro` are copied but not registered as `assetFiles` rows — the publish hook owns those rows, so `fileUrls.chart` keeps naming the pipeline chart until the first publish. `tools/manual/commons-sync-catalog.ts` uses the same reader, so its S3 keys gain the subfolders.

**Flat mirror.** `commons/songs/`, `commons/works/` and `commons/writers/` are the pre-package mirror and are no longer written: `reset-commons` copies only package files and the portraits `authors.portraitUrl` points at. `tools/manual/commons-prune-flat-mirror.ts` lists (dry run) and with `--apply` deletes everything under those prefixes in the configured bucket, keeping the referenced portraits; selection logic is `tools/commons-seed/prune.ts`. Portraits move under `commons/assets/writer/<id>/` once writer packages exist, and `authors.portraitUrl` is rewritten with them — until then `commons/writers/<slug>/portrait.jpg` stays.

**Package columns on `songs`** (migration `2026-09-07_package_model`): `confidence` (`sunday-ready | proofread-score | converted-from-abc | generated-from-midi | chart-only | lyrics-only`), `firstLine`, `tune`, `hasChords`, `rights` and `form` (JSON from the package's `masters/song.json`), `recommendedKey` / `recommendedKeyReason`, `publishedKeys`, `singTimeSeconds`, `scoreSource` (`master | abc | midi`), and the listen-gate record `listenedKeys`, `sundayReadyBy`, `sundayReadyAt`. The seed fills them from the content repo; `publishHooks/song.ts` recomputes them on every approve and clears the listen gate when lyrics or score files change.

**Read side.** `GET /commons/songs` rows add `confidence, sundayReady, featured, firstLine, tune, hasChords, hasScore, hasSlides, hasTiming, hasAccompaniment, recommendedKey, singTimeSeconds`; the `has*` flags come from the served files. `GET /commons/songs/:id` adds `rights, rightsMatrix, ccliReport, attribution, form, publishedKeys, recommendedKeyReason, scoreSource, contributors, sundayReadyAt, sundayReadyBy, listenedKeys` and the file roles `score, slides, chart, chartPdf, attribution, thumb, duration` in `fileUrls` (mapped in `ContentLibraryHelper.role()` — `fileRole()` lives in `@churchapps/helpers`). Shapes live in `helpers/SongPackageHelper.ts`; the rights table in `helpers/RightsHelper.ts`.

**`GET /commons/songs/:id/page`** returns `{ song, rating: { average, count, mine }, history, family, similar }` — the one fetch the song page needs. `mine` needs a user JWT (anonymous → `null`); `family` is parent + siblings + children via `parentSongId`; `similar` is the top 6 of the same language scored +2 same meter, +2 same scripture book, +1 per shared theme, each with a one-sentence `reason`.

**Query params on `GET /commons/songs`:** `sundayReady=true`, `confidence=<tier>`, `language=<English|Spanish|…>`, `q=<text>` (title, first line or writer; case-insensitive substring).

**Listen gate.** `POST /commons/admin/songs/:id/listen { keys: string[] }` (reviewer, see `helpers/ReviewerHelper.ts`) records the keys heard; covering every `publishedKeys` entry on a package that serves a score, chords and slides makes it `sunday-ready`, and `{ keys: [] }` clears back to the computed tier.

Public routes stay unversioned (`/commons/...`); `/v1` is deliberately not introduced here.
