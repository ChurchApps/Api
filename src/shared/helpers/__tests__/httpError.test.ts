import { statusFromError } from "../httpError";

describe("statusFromError", () => {
  it("uses statusCode, then status, then axios response.status", () => {
    expect(statusFromError({ statusCode: 429 })).toBe(429);
    expect(statusFromError({ status: 404 })).toBe(404);
    expect(statusFromError({ response: { status: 400 } })).toBe(400);
  });

  it("maps unknown errors to 500", () => {
    expect(statusFromError(new Error("Deadlock found"))).toBe(500);
    expect(statusFromError({})).toBe(500);
    expect(statusFromError({ status: 200 })).toBe(500);
  });
});
