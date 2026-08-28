import "reflect-metadata";
jest.mock("../controllers/CommonsBaseController", () => ({ CommonsBaseController: class { json(obj: any, status: number) { return { obj, status }; } } }));
jest.mock("../helpers/index", () => ({ ContentLibraryHelper: { publicUrl: (key: string) => `http://cdn/${key}` } }));

import { CommonsAuthorController } from "../controllers/CommonsAuthorController.js";

function authorController(author: any = { id: "author00001", name: "Ada Crosby", bio: "Hymn writer", portraitUrl: "commons/writers/ada.jpg" }) {
  const repos: any = {
    author: { loadById: jest.fn(async () => author) },
    song: { loadPublishedByAuthor: jest.fn(async () => [{ id: "asset000001", title: "Blessed Assurance", year: 1873, language: "English", license: "PD" }]) }
  };
  const controller = new CommonsAuthorController();
  (controller as any).repos = repos;
  (controller as any).actionWrapperAnon = (_req: any, _res: any, action: any) => action();
  (controller as any).json = (obj: any, status: number) => ({ obj, status });
  return { controller, repos };
}

describe("CommonsAuthorController", () => {
  it("returns published songs for an author and a public portrait URL", async () => {
    const { controller } = authorController();
    expect(await controller.get({ params: { id: "author00001" } } as any, {} as any)).toEqual({
      id: "author00001",
      name: "Ada Crosby",
      bio: "Hymn writer",
      portraitUrl: "http://cdn/commons/writers/ada.jpg",
      songs: [{ id: "asset000001", title: "Blessed Assurance", year: 1873, language: "English", license: "PD" }]
    });
  });

  it("404s when the author is missing", async () => {
    const { controller } = authorController(null);
    expect(await controller.get({ params: { id: "missing0001" } } as any, {} as any)).toEqual({ obj: {}, status: 404 });
  });
});
