import "reflect-metadata";
jest.mock("../controllers/CommonsBaseController", () => ({ CommonsBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../helpers/index", () => ({ ContentLibraryHelper: { publicUrl: (key: string) => `http://cdn/${key}` } }));

import { CommonsAuthorController } from "../controllers/CommonsAuthorController.js";

const ADA = { id: "author00001", name: "Ada Crosby", bio: "Hymn writer", portraitUrl: "commons/writers/ada.jpg", links: JSON.stringify([{ label: "Site", url: "https://ada.example" }]) };

function authorController(author: any = ADA) {
  const repos: any = {
    author: {
      loadById: jest.fn(async () => author),
      loadByUserId: jest.fn(async () => author),
      update: jest.fn(async () => {})
    },
    song: { loadPublishedByAuthor: jest.fn(async () => [{ id: "asset000001", title: "Blessed Assurance", year: 1873, language: "English", license: "PD" }]) }
  };
  const controller = new CommonsAuthorController();
  (controller as any).repos = repos;
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).actionWrapperAuth = (_req: any, _res: any, action: any) => action({ id: "user0000001" });
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

describe("CommonsAuthorController", () => {
  it("returns published songs for an author, a public portrait URL and parsed links", async () => {
    const { controller } = authorController();
    expect(await controller.get({ params: { id: "author00001" } } as any, {} as any)).toEqual({
      id: "author00001",
      name: "Ada Crosby",
      bio: "Hymn writer",
      portraitUrl: "http://cdn/commons/writers/ada.jpg",
      links: [{ label: "Site", url: "https://ada.example" }],
      supportLinks: [],
      songs: [{ id: "asset000001", title: "Blessed Assurance", year: 1873, language: "English", license: "PD" }]
    });
  });

  it("404s when the author is missing", async () => {
    const { controller } = authorController(null);
    expect(await controller.get({ params: { id: "missing0001" } } as any, {} as any)).toEqual({ obj: {}, status: 404 });
  });

  it("returns an empty links list when the stored JSON is unusable", async () => {
    const { controller } = authorController({ ...ADA, links: "not json" });
    const profile: any = await controller.get({ params: { id: "author00001" } } as any, {} as any);
    expect(profile.links).toEqual([]);
    expect(profile.supportLinks).toEqual([]);
  });

  it("splits support links out of the stored JSON", async () => {
    const { controller } = authorController({
      ...ADA,
      links: JSON.stringify([
        { label: "Site", url: "https://ada.example" },
        { label: "Bandcamp", url: "https://ada.bandcamp.com", support: true }
      ])
    });
    expect(await controller.get({ params: { id: "author00001" } } as any, {} as any)).toMatchObject({
      links: [{ label: "Site", url: "https://ada.example" }],
      supportLinks: [{ label: "Bandcamp", url: "https://ada.bandcamp.com" }]
    });
  });

  it("mine returns the caller's own profile", async () => {
    const { controller, repos } = authorController();
    expect(await controller.mine({} as any, {} as any)).toEqual({
      id: "author00001",
      name: "Ada Crosby",
      bio: "Hymn writer",
      portraitUrl: "http://cdn/commons/writers/ada.jpg",
      links: [{ label: "Site", url: "https://ada.example" }],
      supportLinks: []
    });
    expect(repos.author.loadByUserId).toHaveBeenCalledWith("user0000001");
  });

  it("mine is empty when the caller owns no author row", async () => {
    const { controller } = authorController(null);
    expect(await controller.mine({} as any, {} as any)).toEqual({});
  });

  it("saves the bio and cleaned links", async () => {
    const { controller, repos } = authorController();
    const body = { bio: "  Writes hymns.  ", links: [{ label: "Site", url: "https://ada.example" }, { label: "", url: "  " }] };
    const result = await controller.saveMine({ body } as any, {} as any);
    expect(repos.author.update).toHaveBeenCalledWith("author00001", { bio: "Writes hymns.", links: JSON.stringify([{ label: "Site", url: "https://ada.example" }]) });
    expect(result).toMatchObject({ bio: "Writes hymns.", links: [{ label: "Site", url: "https://ada.example" }] });
  });

  it("clears the bio and links when both are empty", async () => {
    const { controller, repos } = authorController();
    await controller.saveMine({ body: { bio: "", links: [] } } as any, {} as any);
    expect(repos.author.update).toHaveBeenCalledWith("author00001", { bio: null, links: null });
  });

  it("rejects a caller who owns no author row", async () => {
    const { controller, repos } = authorController(null);
    expect(await controller.saveMine({ body: { bio: "hi" } } as any, {} as any)).toMatchObject({ status: 404 });
    expect(repos.author.update).not.toHaveBeenCalled();
  });

  it("rejects a bio over 2000 characters", async () => {
    const { controller, repos } = authorController();
    expect(await controller.saveMine({ body: { bio: "x".repeat(2001) } } as any, {} as any)).toMatchObject({ status: 400 });
    expect(repos.author.update).not.toHaveBeenCalled();
  });

  it("rejects more than five links", async () => {
    const { controller, repos } = authorController();
    const links = Array.from({ length: 6 }, (_, i) => ({ label: `L${i}`, url: `https://a${i}.example` }));
    expect(await controller.saveMine({ body: { links } } as any, {} as any)).toMatchObject({ status: 400 });
    expect(repos.author.update).not.toHaveBeenCalled();
  });

  it("rejects a link that is not http or https", async () => {
    const { controller, repos } = authorController();
    const result: any = await controller.saveMine({ body: { links: [{ label: "x", url: "javascript:alert(1)" }] } } as any, {} as any);
    expect(result.status).toBe(400);
    expect(result.obj.errors[0]).toContain("javascript:alert(1)");
    expect(repos.author.update).not.toHaveBeenCalled();
  });

  it("saves support links beside site links", async () => {
    const { controller, repos } = authorController();
    const body = {
      bio: "Writes hymns.",
      links: [{ label: "Site", url: "https://ada.example" }],
      supportLinks: [{ label: "Bandcamp", url: "https://ada.bandcamp.com" }]
    };
    const result = await controller.saveMine({ body } as any, {} as any);
    expect(repos.author.update).toHaveBeenCalledWith("author00001", {
      bio: "Writes hymns.",
      links: JSON.stringify([
        { label: "Site", url: "https://ada.example" },
        { label: "Bandcamp", url: "https://ada.bandcamp.com", support: true }
      ])
    });
    expect(result).toMatchObject({
      links: [{ label: "Site", url: "https://ada.example" }],
      supportLinks: [{ label: "Bandcamp", url: "https://ada.bandcamp.com" }]
    });
  });

  it("keeps existing support links when the body omits them", async () => {
    const { controller, repos } = authorController({
      ...ADA,
      links: JSON.stringify([
        { label: "Site", url: "https://ada.example" },
        { label: "Bandcamp", url: "https://ada.bandcamp.com", support: true }
      ])
    });
    await controller.saveMine({ body: { bio: "Hi", links: [{ label: "Site", url: "https://ada.example" }] } } as any, {} as any);
    expect(repos.author.update).toHaveBeenCalledWith("author00001", {
      bio: "Hi",
      links: JSON.stringify([
        { label: "Site", url: "https://ada.example" },
        { label: "Bandcamp", url: "https://ada.bandcamp.com", support: true }
      ])
    });
  });

  it("clears support links when the body sends an empty list", async () => {
    const { controller, repos } = authorController({
      ...ADA,
      links: JSON.stringify([{ label: "Bandcamp", url: "https://ada.bandcamp.com", support: true }])
    });
    await controller.saveMine({ body: { bio: "Hi", links: [], supportLinks: [] } } as any, {} as any);
    expect(repos.author.update).toHaveBeenCalledWith("author00001", { bio: "Hi", links: null });
  });

  it("rejects more than five support links", async () => {
    const { controller, repos } = authorController();
    const supportLinks = Array.from({ length: 6 }, (_, i) => ({ label: `S${i}`, url: `https://s${i}.example` }));
    expect(await controller.saveMine({ body: { supportLinks } } as any, {} as any)).toMatchObject({ status: 400 });
    expect(repos.author.update).not.toHaveBeenCalled();
  });

  it("rejects a support link that is not http or https", async () => {
    const { controller, repos } = authorController();
    const result: any = await controller.saveMine({ body: { supportLinks: [{ label: "x", url: "javascript:alert(1)" }] } } as any, {} as any);
    expect(result.status).toBe(400);
    expect(result.obj.errors[0]).toContain("javascript:alert(1)");
    expect(repos.author.update).not.toHaveBeenCalled();
  });
});
