// MCP server pre-authenticated by Express auth pipeline; api_call tool re-presents same header.

import { BaseHttpController, controller, httpPost } from "inversify-express-utils";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildMcpServer } from "./McpServer.js";
import { LoginRateLimiter } from "../membership/helpers/LoginRateLimiter.js";
import { protectedResourceMetadataUrl } from "./OAuthMetadata.js";
import { McpPrincipal } from "./lessonsProxy.js";

@controller("/mcp")
export class McpController extends BaseHttpController {
  @httpPost("/")
  public async handle(req: express.Request, res: express.Response): Promise<void> {
    const principal = (this.httpContext?.user as any)?.details as McpPrincipal | undefined;
    const churchId = principal?.churchId;
    if (!churchId) {
      // Points OAuth-capable clients (claude.ai, ChatGPT) at the sign-in discovery document.
      res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${protectedResourceMetadataUrl()}"`);
      res.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate");
      res.status(401).json({ error: "Unauthorized — MCP requires a valid bearer token (cak_* API key or JWT)." });
      return;
    }

    // Stateless per-request server; API Gateway (REST and HTTP API alike) buffers responses, so disable SSE.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });
    const server = buildMcpServer(req.headers.authorization as string | undefined, LoginRateLimiter.getClientIp(req), principal);

    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err: any) {
      console.error("MCP transport error:", err);
      if (!res.headersSent) res.status(500).json({ error: "MCP transport error" });
    }
  }
}
