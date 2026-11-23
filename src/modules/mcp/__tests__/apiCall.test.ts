jest.mock("../../../shared/helpers/Environment.js", () => ({ Environment: {} }));

import express from "express";
import { dispatch, setExpressApp } from "../internalDispatch.js";
import { makeApiCallHandler } from "../tools/apiCall.js";
import { LoginRateLimiter } from "../../membership/helpers/LoginRateLimiter.js";

describe("MCP api_call", () => {
  let seenIp = "";
  beforeAll(() => {
    setExpressApp(((req: express.Request, res: express.Response) => {
      seenIp = LoginRateLimiter.getClientIp(req);
      res.json({ ok: true });
    }) as express.Application);
  });

  it("carries the outer caller's ip into the dispatched request", async () => {
    await dispatch({ method: "GET", path: "/membership/people", clientIp: "203.0.113.9" });
    expect(seenIp).toBe("203.0.113.9");
  });

  it("forwards the session ip from the tool handler", async () => {
    const handler = makeApiCallHandler(() => "Bearer x", () => "198.51.100.4");
    await handler({ method: "GET", path: "/membership/people" });
    expect(seenIp).toBe("198.51.100.4");
  });

  it.each(["/membership/users/login", "/membership/users/verifyCode", "/membership/users/forgot", "/membership/users/requestLoginCode", "/membership/users/loginWithCode", "/membership/users/register", "/mcp"])("refuses credential endpoint %s", async (path) => {
    seenIp = "untouched";
    const handler = makeApiCallHandler(() => "Bearer x", () => "198.51.100.4");
    const result = await handler({ method: "POST", path });
    expect(result.isError).toBe(true);
    expect(seenIp).toBe("untouched");
  });

  it.each(["/membership/users/mfa/status", "/membership/users/mfa/setup", "/membership/users/mfa/enable", "/membership/users/mfa/disable", "/membership/users/mfa/reset/u1"])("refuses the two-factor endpoint %s", async (path) => {
    seenIp = "untouched";
    const handler = makeApiCallHandler(() => "Bearer x", () => "198.51.100.4");
    const result = await handler({ method: "POST", path });
    expect(result.isError).toBe(true);
    expect(seenIp).toBe("untouched");
  });

  it("does not leak internal error messages", async () => {
    setExpressApp(((_req: express.Request, _res: express.Response): void => { throw new Error("secret db host 10.0.0.5"); }) as express.Application);
    jest.spyOn(console, "error").mockImplementation(() => {});
    const handler = makeApiCallHandler(() => "Bearer x");
    const result = await handler({ method: "GET", path: "/membership/people" });
    expect(result.content[0].text).not.toContain("10.0.0.5");
    (console.error as jest.Mock).mockRestore();
  });
});
