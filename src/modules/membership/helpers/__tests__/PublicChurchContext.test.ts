jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { jwtSecret: "test-secret" } }));

import jwt from "jsonwebtoken";
import { Environment } from "../../../../shared/helpers/Environment.js";
import { PublicChurchContext } from "../PublicChurchContext.js";

const req = (over: any = {}) => ({ headers: {}, body: {}, ...over });

describe("PublicChurchContext", () => {
  it("reads churchId from a church JWT", () => {
    const token = jwt.sign({ churchId: "c1", id: "u1" }, Environment.jwtSecret);
    expect(PublicChurchContext.churchIdFromAuth(req({ headers: { authorization: "Bearer " + token } }))).toBe("c1");
  });

  it("ignores a user JWT with no churchId", () => {
    const token = jwt.sign({ id: "u1", email: "a@b.com" }, Environment.jwtSecret);
    expect(PublicChurchContext.churchIdFromAuth(req({ headers: { authorization: "Bearer " + token } }))).toBeNull();
  });

  it("ignores a forged JWT", () => {
    const token = jwt.sign({ churchId: "c1" }, "wrong-secret");
    expect(PublicChurchContext.churchIdFromAuth(req({ headers: { authorization: "Bearer " + token } }))).toBeNull();
  });

  it("round-trips a site token", () => {
    const token = PublicChurchContext.createSiteToken("c9");
    expect(PublicChurchContext.churchIdFromSiteToken(token)).toBe("c9");
  });

  it("rejects a site token with the wrong purpose", () => {
    const token = jwt.sign({ churchId: "c9", purpose: "other" }, Environment.jwtSecret);
    expect(PublicChurchContext.churchIdFromSiteToken(token)).toBeNull();
  });

  it("bind prefers JWT and flags a mismatched claim", () => {
    const token = jwt.sign({ churchId: "c1" }, Environment.jwtSecret);
    const r = req({ headers: { authorization: "Bearer " + token }, body: { churchId: "c2" } });
    expect(PublicChurchContext.bind(r, "c2")).toEqual({ churchId: null, mismatch: true });
    expect(PublicChurchContext.bind(r, "c1")).toEqual({ churchId: "c1", mismatch: false });
  });

  it("bind accepts a matching site token", () => {
    const token = PublicChurchContext.createSiteToken("c1");
    const r = req({ body: { siteToken: token, churchId: "c1" } });
    expect(PublicChurchContext.bind(r, "c1")).toEqual({ churchId: "c1", mismatch: false });
    expect(PublicChurchContext.bind(r, "c2")).toEqual({ churchId: null, mismatch: true });
  });

  it("bind reports no bound church when there is no token", () => {
    expect(PublicChurchContext.bind(req({ body: { churchId: "c1" } }), "c1")).toEqual({ churchId: null, mismatch: false });
  });

  it("bind never returns a churchId on mismatch, so a caller falling back to the claim still gets a flag", () => {
    const token = PublicChurchContext.createSiteToken("c1");
    const bound = PublicChurchContext.bind(req({ body: { siteToken: token } }), "c2");
    expect(bound.mismatch).toBe(true);
    expect(bound.churchId).toBeNull();
  });
});
