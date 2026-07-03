// MCP server pre-authenticated by Express auth pipeline; api_call tool re-presents same header.

import { BaseHttpController, controller, httpPost } from "inversify-express-utils";
import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildMcpServer } from "./McpServer.js";

@controller("/mcp")
export class McpController extends BaseHttpController {
  @httpPost("/")
  public async handle(req: express.Request, res: express.Response): Promise<void> {
    const churchId = (this.httpContext?.user as any)?.details?.churchId;
    if (!churchId) {
      res.status(401).json({ error: "Unauthorized — MCP requires a valid bearer token (cak_* API key or JWT)." });
      return;
    }

    // Stateless per-request server; API Gateway REST can't stream, so disable SSE.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });
    const server = buildMcpServer(req.headers.authorization as string | undefined);

    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err: any) {
      if (!res.headersSent) res.status(500).json({ error: "MCP transport error", message: err?.message || String(err) });
    }
  }
}
