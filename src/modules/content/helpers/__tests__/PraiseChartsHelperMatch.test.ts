jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { praiseChartsConsumerKey: "k", praiseChartsConsumerSecret: "s" } }));
jest.mock("../../../../shared/infrastructure/index.js", () => ({ RepoManager: { getRepos: jest.fn(async () => ({})) } }));

import { PraiseChartsHelper } from "../PraiseChartsHelper.js";

const items = [
  { id: "1", details: { title: "Goodness Of God", artists: { names: "Bethel Music" }, lyrics: "" } },
  { id: "2", details: { title: "This Is Amazing Grace", artists: { names: "Phil Wickham" }, lyrics: "" } }
];

describe("PraiseChartsHelper.findBestMatch title threshold", () => {
  beforeEach(() => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ arrangements: { items } }) })) as never;
    jest.spyOn(PraiseChartsHelper, "convertItemToSongDetail").mockImplementation((item: any) => ({ praiseChartsId: item.id, title: item.details.title, artist: item.details.artists.names }) as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it("rejects a result whose title barely overlaps the search", async () => {
    expect(await PraiseChartsHelper.findBestMatch("Mungu Ni Mwema God", "Local Choir")).toBeNull();
  });

  it("keeps a result that shares most title words", async () => {
    const match = await PraiseChartsHelper.findBestMatch("Amazing Grace", "Phil Wickham");
    expect(match?.praiseChartsId).toBe("2");
  });
});
