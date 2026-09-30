jest.mock("@churchapps/apihelper", () => ({ Principal: class {}, AuthenticatedUser: class {} }));
jest.mock("../../models/index.js", () => ({}));
jest.mock("../../repositories/index.js", () => ({ Repos: class {} }));
jest.mock("../../helpers/index.js", () => ({ Environment: { jwtSecret: "test-secret", jwtExpiration: "2 days" } }));
jest.mock("../../../../shared/auth/buildPermStrings.js", () => ({ buildPermStrings: () => [] }));
jest.mock("../../../../shared/auth/Scopes.js", () => ({ filterPermissionsByScopes: (p: any) => p }));

import jwt from "jsonwebtoken";
import { AuthenticatedUser } from "../AuthenticatedUser.js";
import { Environment } from "../../helpers/index.js";

function ttlSeconds(token: string) {
  const decoded = jwt.decode(token) as jwt.JwtPayload;
  return (decoded.exp as number) - (decoded.iat as number);
}

const user = { id: "u1", email: "a@b.c", firstName: "A", lastName: "B" } as any;

describe("AuthenticatedUser.getUserJwt", () => {
  it("defaults to Environment.jwtExpiration", () => {
    expect(Environment.jwtExpiration).toBe("2 days");
    expect(ttlSeconds(AuthenticatedUser.getUserJwt(user))).toBe(2 * 24 * 60 * 60);
  });

  it("honors an explicit SSO TTL", () => {
    expect(ttlSeconds(AuthenticatedUser.getUserJwt(user, "10m"))).toBe(10 * 60);
  });

  it("honors an explicit impersonate TTL", () => {
    expect(ttlSeconds(AuthenticatedUser.getUserJwt(user, "2 hours"))).toBe(2 * 60 * 60);
  });
});

describe("AuthenticatedUser.getCombinedApiJwt", () => {
  const userChurch = { church: { id: "c1" }, person: { id: "p1" }, groups: [], apis: [] } as any;

  it("honors a numeric TTL in seconds (local 10-second JWTs)", () => {
    expect(ttlSeconds(AuthenticatedUser.getCombinedApiJwt(user, userChurch, 10))).toBe(10);
  });
});

describe("AuthenticatedUser.verifyRefreshableJwt", () => {
  const DAY = 24 * 60 * 60;
  const now = () => Math.floor(Date.now() / 1000);
  const sign = (payload: object, iat: number, lifetime: number) => jwt.sign({ ...payload, iat, exp: iat + lifetime }, "test-secret");
  const userClaims = { id: "u1", email: "a@b.c", firstName: "A", lastName: "B" };

  it("accepts an unexpired user token", () => {
    expect(AuthenticatedUser.verifyRefreshableJwt(AuthenticatedUser.getUserJwt(user)).id).toBe("u1");
  });

  it("accepts a user token that expired a few days ago (#1133)", () => {
    const token = sign(userClaims, now() - 7 * DAY, 2 * DAY);
    expect(AuthenticatedUser.verifyRefreshableJwt(token).id).toBe("u1");
  });

  it("rejects a user token past the refresh window", () => {
    const token = sign(userClaims, now() - 40 * DAY, 2 * DAY);
    expect(() => AuthenticatedUser.verifyRefreshableJwt(token)).toThrow();
  });

  it("rejects expired short-lived impersonation and SSO tokens", () => {
    expect(() => AuthenticatedUser.verifyRefreshableJwt(sign(userClaims, now() - 3 * 60 * 60, 2 * 60 * 60))).toThrow();
    expect(() => AuthenticatedUser.verifyRefreshableJwt(sign(userClaims, now() - 20 * 60, 10 * 60))).toThrow();
  });

  it("rejects an expired church token", () => {
    const token = sign({ ...userClaims, churchId: "c1", permissions: [] }, now() - 3 * DAY, 2 * DAY);
    expect(() => AuthenticatedUser.verifyRefreshableJwt(token)).toThrow();
  });

  it("rejects a token signed with another secret", () => {
    const token = jwt.sign({ ...userClaims, iat: now() - 3 * DAY, exp: now() - DAY }, "other-secret");
    expect(() => AuthenticatedUser.verifyRefreshableJwt(token)).toThrow();
  });
});
