jest.mock("../../../shared/helpers/Environment", () => ({ Environment: { openAiApiKey: "" } }));

import { QualityHelper } from "../helpers/QualityHelper";

describe("QualityHelper", () => {
  const origKey = process.env.OPENAI_API_KEY;
  afterEach(() => {
    if (origKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = origKey;
  });

  it("returns a completeness breakdown without treating the score as an AI judgment", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await QualityHelper.score({
      title: "Hope",
      chordPro: "Verse 1\n[G]Sing",
      scripture: "Isaiah 40:4",
      themes: "Hope, Mercy",
      bpm: 72,
      songKey: "G",
      fileRoles: ["demoAudio"]
    });
    expect(result.qualityScore).toBe(QualityHelper.heuristicScore({
      chordPro: "Verse 1\n[G]Sing",
      scripture: "Isaiah 40:4",
      themes: "Hope, Mercy",
      bpm: 72,
      songKey: "G",
      fileRoles: ["demoAudio"]
    }));
    const detail = JSON.parse(result.qualityDetail as string);
    expect(detail.llm).toBe(0);
    expect(detail.parts).toEqual(expect.arrayContaining(["demo", "scripture", "themes", "bpm", "key"]));
    expect(detail.notes).toMatch(/completeness heuristic only/i);
    expect(detail.notes).toMatch(/not an AI judgment/i);
  });
});
