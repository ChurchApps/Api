// Issue #1111: a large FreeShow sync (~2500 songs) only imported a few dozen.
// importSongs fired one unbounded Promise.all over the whole array, so every
// song hit PraiseCharts at once; the rate-limited failures were then swallowed
// by importSong's empty catch and silently dropped from the result.
jest.mock("../PraiseChartsHelper.js", () => ({ PraiseChartsHelper: { findBestMatch: jest.fn(async () => null) } }));
jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn(async () => ({})) } }));

import { SongHelper, FreeShowSong } from "../SongHelper.js";

describe("SongHelper.importSongs concurrency", () => {
  const SONG_COUNT = 250;
  // Stands in for PraiseCharts' rate limit: reject anything over 10 in flight.
  const RATE_LIMIT = 10;

  let inFlight = 0;
  let peakInFlight = 0;
  let rateLimited = 0;

  const songs: FreeShowSong[] = Array.from({ length: SONG_COUNT }, (_, i) => ({
    freeShowId: `fs-${i}`,
    title: `Song ${i}`,
    artist: "Demo Artist"
  }));

  beforeEach(() => {
    inFlight = 0;
    peakInFlight = 0;
    rateLimited = 0;
    jest.spyOn(SongHelper, "importSong").mockImplementation(async (_churchId: string, song: FreeShowSong) => {
      inFlight++;
      peakInFlight = Math.max(peakInFlight, inFlight);
      try {
        await new Promise(resolve => setImmediate(resolve));
        if (inFlight > RATE_LIMIT) {
          rateLimited++;
          // Mirrors importSong's own catch block: the error never escapes.
          return null;
        }
        return { id: song.freeShowId, churchId: _churchId, freeShowId: song.freeShowId, name: "Default" } as never;
      } finally {
        inFlight--;
      }
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it("keeps concurrent imports bounded so a large sync is not rate limited", async () => {
    const result = await SongHelper.importSongs("CHURCH1", songs);

    expect(peakInFlight).toBeLessThanOrEqual(RATE_LIMIT);
    expect(rateLimited).toBe(0);
    expect(result.filter(Boolean)).toHaveLength(SONG_COUNT);
  });
});
