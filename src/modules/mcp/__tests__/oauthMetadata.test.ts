jest.mock("../../../shared/helpers/Environment.js", () => ({ Environment: { membershipApi: "https://api.example/membership", b1AdminRoot: "https://admin.example" } }));
jest.mock("../McpServer.js", () => ({ buildMcpServer: jest.fn() }));
jest.mock("../../membership/helpers/LoginRateLimiter.js", () => ({ LoginRateLimiter: { getClientIp: () => "127.0.0.1" } }));

import { authorizationServerMetadata, protectedResourceMetadata } from "../OAuthMetadata.js";
import { McpController } from "../McpController.js";

describe("MCP OAuth discovery", () => {
  it("publishes protected resource metadata for /mcp pointing at the B1 authorization server", () => {
    const meta = protectedResourceMetadata();
    expect(meta.resource).toBe("https://api.example/mcp");
    expect(meta.authorization_servers).toEqual(["https://api.example"]);
    expect(meta.scopes_supported).toContain("people:read");
  });

  it("publishes authorization server metadata with B1Admin consent, registration and S256 PKCE", () => {
    const meta = authorizationServerMetadata();
    expect(meta.issuer).toBe("https://api.example");
    expect(meta.authorization_endpoint).toBe("https://admin.example/oauth");
    expect(meta.token_endpoint).toBe("https://api.example/membership/oauth/token");
    expect(meta.registration_endpoint).toBe("https://api.example/membership/oauth/register");
    expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
    expect(meta.token_endpoint_auth_methods_supported).toContain("none");
  });

  it("answers an unauthenticated /mcp call with a WWW-Authenticate header naming the resource metadata", async () => {
    const controller = new McpController();
    (controller as any).httpContext = { user: { details: {} } };
    const headers: Record<string, string> = {};
    const res: any = { setHeader: (k: string, v: string) => { headers[k] = v; }, status: jest.fn(() => res), json: jest.fn(() => res) };
    await controller.handle({ headers: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(headers["WWW-Authenticate"]).toBe('Bearer resource_metadata="https://api.example/.well-known/oauth-protected-resource"');
  });
});
