# Commons module — song packages

A song id is always the current song. There are no release ids: a republish rewrites the same id's files and rows, and the `/assets/:id/history` timeline is the only version record.

**Package columns on `songs`** (migration `2026-09-07_package_model`): `confidence` (`sunday-ready | proofread-score | converted-from-abc | generated-from-midi | chart-only | lyrics-only`), `firstLine`, `tune`, `hasChords`, `rights` and `form` (JSON from the package's `masters/song.json`), `recommendedKey` / `recommendedKeyReason`, `publishedKeys`, `singTimeSeconds`, `scoreSource` (`master | abc | midi`), and the listen-gate record `listenedKeys`, `sundayReadyBy`, `sundayReadyAt`. The seed (`tools/commons-seed/catalog.ts`) fills them from the content repo; `publishHooks/song.ts` recomputes them on every approve and clears the listen gate when lyrics or score files change.

**Read side.** `GET /commons/songs` rows add `confidence, sundayReady, featured, firstLine, tune, hasChords, hasScore, hasSlides, hasTiming, hasAccompaniment, recommendedKey, singTimeSeconds`; the `has*` flags come from the served files. `GET /commons/songs/:id` adds `rights, rightsMatrix, ccliReport, attribution, form, publishedKeys, recommendedKeyReason, scoreSource, contributors, sundayReadyAt, sundayReadyBy, listenedKeys` and the file roles `score, slides, chart, chartPdf, attribution, thumb, duration` in `fileUrls` (mapped in `ContentLibraryHelper.role()` — `fileRole()` lives in `@churchapps/helpers`). Shapes live in `helpers/SongPackageHelper.ts`; the rights table in `helpers/RightsHelper.ts`.

**`GET /commons/songs/:id/page`** returns `{ song, rating: { average, count, mine }, history, family, similar }` — the one fetch the song page needs. `mine` needs a user JWT (anonymous → `null`); `family` is parent + siblings + children via `parentSongId`; `similar` is the top 6 of the same language scored +2 same meter, +2 same scripture book, +1 per shared theme, each with a one-sentence `reason`.

**Query params on `GET /commons/songs`:** `sundayReady=true`, `confidence=<tier>`, `language=<English|Spanish|…>`, `q=<text>` (title, first line or writer; case-insensitive substring).

**Listen gate.** `POST /commons/admin/songs/:id/listen { keys: string[] }` (reviewer, see `helpers/ReviewerHelper.ts`) records the keys heard; covering every `publishedKeys` entry on a package that serves a score, chords and slides makes it `sunday-ready`, and `{ keys: [] }` clears back to the computed tier.

Public routes stay unversioned (`/commons/...`); `/v1` is deliberately not introduced here.
