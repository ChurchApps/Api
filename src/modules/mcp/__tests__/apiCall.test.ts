import { dispatch, setExpressApp } from "../internalDispatch.js";
import { makeApiCallHandler } from "../tools/apiCall.js";
import { LoginRateLimiter } from "../../membership/helpers/LoginRateLimiter.js";

describe("MCP api_call", () => {
  let seenIp = "";
  beforeAll(() => {
    setExpressApp(((req: any, res: any) => {
      seenIp = LoginRateLimiter.getClientIp(req);
      res.json({ ok: true });
    }) as any);
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

  it.each(["/membership/users/login", "/membership/users/verifyCode", "/membership/users/forgot", "/membership/users/register", "/mcp"])("refuses credential endpoint %s", async (path) => {
    seenIp = "untouched";
    const handler = makeApiCallHandler(() => "Bearer x", () => "198.51.100.4");
    const result: any = await handler({ method: "POST", path });
    expect(result.isError).toBe(true);
    expect(seenIp).toBe("untouched");
  });

  it("does not leak internal error messages", async () => {
    setExpressApp((() => { throw new Error("secret db host 10.0.0.5"); }) as any);
    jest.spyOn(console, "error").mockImplementation(() => {});
    const handler = makeApiCallHandler(() => "Bearer x");
    const result: any = await handler({ method: "GET", path: "/membership/people" });
    expect(result.content[0].text).not.toContain("10.0.0.5");
    (console.error as jest.Mock).mockRestore();
  });
});
