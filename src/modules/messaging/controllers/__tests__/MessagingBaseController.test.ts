import "reflect-metadata";

jest.mock("../../../../shared/infrastructure/index", () => ({ BaseController: class { constructor(_module?: string) {} } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { people: { edit: "peopleEdit", viewConfidentialNotes: "peopleViewConfidentialNotes" } } }));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));

import { MessagingBaseController } from "../MessagingBaseController.js";

describe("MessagingBaseController.isAnonPublicConversation", () => {
  const ctrl = Object.create(MessagingBaseController.prototype) as MessagingBaseController;

  it("allows only public streamingLive rooms with anonymous posts", () => {
    expect((ctrl as any).isAnonPublicConversation({ contentType: "streamingLive", allowAnonymousPosts: true, visibility: "public" })).toBe(true);
  });

  it("rejects host chat, groups, and rooms missing the public/anon flags", () => {
    expect((ctrl as any).isAnonPublicConversation({ contentType: "streamingLiveHost", allowAnonymousPosts: true, visibility: "public" })).toBe(false);
    expect((ctrl as any).isAnonPublicConversation({ contentType: "group", allowAnonymousPosts: true, visibility: "public" })).toBe(false);
    expect((ctrl as any).isAnonPublicConversation({ contentType: "streamingLive", allowAnonymousPosts: false, visibility: "public" })).toBe(false);
    expect((ctrl as any).isAnonPublicConversation({ contentType: "streamingLive", allowAnonymousPosts: true, visibility: "hidden" })).toBe(false);
    expect((ctrl as any).isAnonPublicConversation(null)).toBe(false);
  });
});
