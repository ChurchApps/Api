import "reflect-metadata";

jest.mock("../../../../shared/infrastructure/index", () => ({ BaseController: class { constructor(_module?: string) {} } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { people: { edit: "peopleEdit", viewConfidentialNotes: "peopleViewConfidentialNotes" } } }));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));

import { MessagingBaseController } from "../MessagingBaseController.js";

const ctrl = Object.create(MessagingBaseController.prototype) as MessagingBaseController;

describe("MessagingBaseController.isAnonPublicConversation", () => {
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

describe("MessagingBaseController.isAuthenticated / isSameChurch", () => {
  // CustomBaseController builds an AuthenticatedUser out of an empty Principal for anonymous
  // requests, so every field is "" rather than the object being null.
  const anon = { id: "", churchId: "", personId: "" };
  const member = { id: "u1", churchId: "c1", personId: "p1" };

  it("treats the empty anonymous AuthenticatedUser as unauthenticated", () => {
    expect((ctrl as any).isAuthenticated(anon)).toBe(false);
    expect((ctrl as any).isAuthenticated(null)).toBe(false);
    expect((ctrl as any).isAuthenticated(undefined)).toBe(false);
    expect((ctrl as any).isAuthenticated({ id: "u1", churchId: "" })).toBe(false);
    expect((ctrl as any).isAuthenticated(member)).toBe(true);
  });

  it("only matches a real principal against a non-empty church", () => {
    expect((ctrl as any).isSameChurch(member, "c1")).toBe(true);
    expect((ctrl as any).isSameChurch(member, "c2")).toBe(false);
    expect((ctrl as any).isSameChurch(anon, "")).toBe(false);
    expect((ctrl as any).isSameChurch(anon, "c1")).toBe(false);
    expect((ctrl as any).isSameChurch(member, undefined)).toBe(false);
  });
});
