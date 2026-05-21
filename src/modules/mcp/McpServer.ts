// Builds a fresh MCP server for one HTTP request. The Streamable HTTP
// transport is stateless on Lambda — a new transport + Server pair per call
// avoids any cross-request state and lets us bind the api_call tool to this
// request's Authorization header.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listEndpointsSchema, listEndpointsHandler } from "./tools/listEndpoints.js";
import { describeEndpointSchema, describeEndpointHandler } from "./tools/describeEndpoint.js";
import { apiCallSchema, makeApiCallHandler } from "./tools/apiCall.js";
import { describePageBuilderSchema, describePageBuilderHandler } from "./tools/describePageBuilder.js";

export function buildMcpServer(authorization: string | undefined): McpServer {
  const server = new McpServer({ name: "churchapps-api", version: "1.0.0" });

  server.registerTool(
    "list_endpoints",
    {
      title: "List API endpoints",
      description:
        "Lists every HTTP endpoint exposed by the ChurchApps Api, optionally filtered by path substring or HTTP method. Each entry includes the controller name and the API key scopes that likely gate access. Call this first to discover what api_call can invoke. When working on /content/* routes (building B1App pages/sections/elements/HTML blocks) call describe_page_builder first — it has the data model, the full elementType catalog, and the answersJSON shapes.",
      inputSchema: listEndpointsSchema
    },
    listEndpointsHandler
  );

  server.registerTool(
    "describe_endpoint",
    {
      title: "Describe API endpoint",
      description:
        "Returns a brief summary and (where available) a curated request/response example for one endpoint. Use this after list_endpoints to learn the request body shape before calling POST/PUT. For /content/* routes (page building) describe_page_builder is more useful — it covers the whole Page→Section→Element model and all element types in one call.",
      inputSchema: describeEndpointSchema
    },
    describeEndpointHandler
  );

  server.registerTool(
    "api_call",
    {
      title: "Call the ChurchApps API",
      description:
        "Invokes a ChurchApps Api endpoint as the authenticated user. The request runs through the same auth, permission, and tenant-scoping middleware as a normal HTTP call — responses are scoped to the user's church and API key permissions. Response bodies above 64 KB are truncated; use query parameters to narrow results.",
      inputSchema: apiCallSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false
      }
    },
    makeApiCallHandler(() => authorization)
  );

  server.registerTool(
    "describe_page_builder",
    {
      title: "B1App page builder guide",
      description:
        "Returns a single self-contained guide for building B1App pages via the /content/* endpoints: the Page→Section→Element data model, the standard create workflow, every elementType (text, image, video, row, rawHTML/HTML block, iframe, block, etc.) with its answersJSON shape, the auto-creation behavior for row columns and carousel slides, the stylesJSON breakpoint format, and a worked end-to-end example. Call this once whenever the task involves creating or editing page content.",
      inputSchema: describePageBuilderSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    describePageBuilderHandler
  );

  return server;
}
