import { FLAT_MIRROR_PREFIXES, keepKey, selectPruneKeys } from "../../../../tools/commons-seed/prune";

describe("commons-prune-flat-mirror selection", () => {
  const keys = [
    "commons/songs/en/public-domain/a-child-of-light--abc123/tune.mid",
    "commons/songs/en/public-domain/a-child-of-light--abc123/art.webp",
    "commons/works/abide/tune.abc",
    "commons/writers/harriet-buell/portrait.jpg",
    "commons/writers/harriet-buell/writer.json",
    "commons/writers/joshua-stegmann/portrait.jpg",
    "commons/assets/song/abc123/sources/tune.mid",
    "commons/pending/sub1/demoAudio.mp3"
  ];

  it("deletes everything under the three mirror prefixes except the portraits the authors table still points at", () => {
    const plan = selectPruneKeys(keys, ["commons/writers/harriet-buell/portrait.jpg", null, "/commons/writers/nobody/portrait.jpg"]);
    expect(plan.kept).toEqual(["commons/writers/harriet-buell/portrait.jpg"]);
    expect(plan.prune).toEqual([
      "commons/songs/en/public-domain/a-child-of-light--abc123/tune.mid",
      "commons/songs/en/public-domain/a-child-of-light--abc123/art.webp",
      "commons/works/abide/tune.abc",
      "commons/writers/harriet-buell/writer.json",
      "commons/writers/joshua-stegmann/portrait.jpg"
    ]);
  });

  it("never touches the package layout or the pending prefix", () => {
    const plan = selectPruneKeys(keys, []);
    const touched = [...plan.prune, ...plan.kept];
    expect(touched.some((k) => k.startsWith("commons/assets/") || k.startsWith("commons/pending/"))).toBe(false);
    expect(FLAT_MIRROR_PREFIXES).toEqual(["commons/songs/", "commons/works/", "commons/writers/"]);
  });

  it("keepKey accepts bucket keys, leading slashes and full content URLs, and refuses keys outside commons/", () => {
    expect(keepKey("commons/writers/x/portrait.jpg")).toBe("commons/writers/x/portrait.jpg");
    expect(keepKey("/commons/writers/x/portrait.jpg")).toBe("commons/writers/x/portrait.jpg");
    expect(keepKey("https://content.churchapps.org/commons/writers/x/portrait.jpg")).toBe("commons/writers/x/portrait.jpg");
    expect(keepKey("https://elsewhere.example/portrait.jpg")).toBeNull();
    expect(keepKey(null)).toBeNull();
  });
});
