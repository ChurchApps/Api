import { lookupExample } from "../examples.js";

describe("MCP Groups, Serving, and Events guidance", () => {
  it("distinguishes People Groups, Ministries, and Teams before group writes", () => {
    const example = lookupExample("POST", "/membership/groups");

    expect(example?.guidance?.importantFields).toMatchObject({
      "tags=standard": expect.stringContaining("People Group"),
      "tags=ministry": expect.stringContaining("Serving Ministry"),
      "tags=team": expect.stringContaining("Serving Team")
    });
    expect(example?.guidance?.companionCheck).toEqual(
      expect.arrayContaining([expect.stringContaining("Do not create both automatically")])
    );
  });

  it("requires event groupIds to refer to standard People Groups", () => {
    const example = lookupExample("POST", "/content/events");

    expect(example?.guidance?.requiredDiscovery).toEqual(
      expect.arrayContaining([expect.stringContaining("tags includes standard")])
    );
    expect(example?.guidance?.doNotUseWhen).toEqual(
      expect.arrayContaining([expect.stringContaining("Serving Ministry or Team ID")])
    );
  });

  it("guides agents to inspect a target record before dependent writes", () => {
    const example = lookupExample("GET", "/membership/groups/:id");

    expect(example?.guidance?.safeWrite).toEqual(
      expect.arrayContaining([expect.stringContaining("Inspect tags")])
    );
  });

  it("explains that membership roles differ by record type", () => {
    const example = lookupExample("POST", "/membership/groupmembers");

    expect(example?.guidance?.safeWrite).toEqual(
      expect.arrayContaining([
        expect.stringContaining("scheduled"),
        expect.stringContaining("service-planning"),
        expect.stringContaining("community")
      ])
    );
  });
});
