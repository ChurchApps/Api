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
