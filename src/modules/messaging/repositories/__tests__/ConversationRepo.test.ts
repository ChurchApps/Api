import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
// apihelper ships untransformed ESM; stub the only symbol ConversationRepo uses.
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "cvs_generated" } }));

import { ConversationRepo } from "../ConversationRepo";

// Regression: rowToModel dropped allowAnonymousPosts, so undefined check always rejected anon posts despite db=true.
describe("ConversationRepo.convertToModel", () => {
  const repo = new ConversationRepo();

  it("preserves allowAnonymousPosts=true from the db row", () => {
    const model = repo.convertToModel({ id: "CVS1", churchId: "C1", allowAnonymousPosts: true });
    expect(model.allowAnonymousPosts).toBe(true);
  });

  it("preserves allowAnonymousPosts=false from the db row", () => {
    const model = repo.convertToModel({ id: "CVS1", churchId: "C1", allowAnonymousPosts: false });
    expect(model.allowAnonymousPosts).toBe(false);
  });

  it("coerces a truthy non-boolean (e.g. 1 from a BIT/TINYINT column) to boolean true", () => {
    const model = repo.convertToModel({ id: "CVS1", churchId: "C1", allowAnonymousPosts: 1 });
    expect(model.allowAnonymousPosts).toBe(true);
  });

  it("carries through the other persisted fields the model exposes", () => {
    const model = repo.convertToModel({
      id: "CVS1",
      churchId: "C1",
      contentType: "streamingLive",
      contentId: "STR1",
      title: "Chat",
      groupId: "GRP1",
      visibility: "public",
      firstPostId: "MSG1",
      lastPostId: "MSG2",
      postCount: 3,
      allowAnonymousPosts: true
    });
    expect(model).toMatchObject({
      groupId: "GRP1",
      visibility: "public",
      firstPostId: "MSG1",
      lastPostId: "MSG2",
      postCount: 3
    });
  });
});
