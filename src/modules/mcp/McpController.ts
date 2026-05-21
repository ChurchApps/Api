// Exposes the MCP server over Streamable HTTP at POST /mcp. The Express
// auth pipeline (CustomAuthProvider) has already resolved the bearer token
// to a Principal on httpContext.user before this controller runs — we just
// reject unauthenticated calls and let the api_call tool re-present the
// same Authorization header on each nested call.

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

    // Stateless mode: no session id, a fresh server+transport per request.
    // Fits Lambda's request model and keeps the path safe when running
    // behind a load balancer with no sticky sessions.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
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
