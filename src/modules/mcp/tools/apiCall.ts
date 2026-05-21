import { z } from "zod";
import { dispatch } from "../internalDispatch.js";

// Paths that must not be reachable via MCP: provider webhooks expect raw
// signed bodies, the jwtSecret-gated endpoint is operator-only, and OAuth
// admin endpoints manage client credentials we don't want LLMs touching.
const BLOCKLIST: RegExp[] = [
  /^\/giving\/donate\/webhook\//i,
  /^\/membership\/people\/apiemails$/i,
  /^\/membership\/oauth\/clients/i
];

export const apiCallSchema = {
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).describe("HTTP verb."),
  path: z.string().describe("Path including any module prefix, e.g. '/membership/people' or '/membership/people/abc123'."),
  query: z.record(z.any()).optional().describe("Optional query-string parameters as a flat object."),
  body: z.any().optional().describe("Optional JSON request body. For most POST endpoints this is an array of model objects.")
};

export function makeApiCallHandler(getAuthorization: () => string | undefined) {
  return async (args: { method: string; path: string; query?: Record<string, any>; body?: any }) => {
    const path = args.path.startsWith("/") ? args.path : "/" + args.path;
    if (BLOCKLIST.some((re) => re.test(path))) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Path ${path} is not exposed via MCP (webhook/admin/operator-only endpoint).` }]
      };
    }

    const auth = getAuthorization();
    if (!auth) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: "Missing Authorization header on the MCP session." }]
      };
    }

    try {
      const result = await dispatch({
        method: args.method,
        path,
        query: args.query,
        body: args.body,
        authorization: auth
      });
      const text = JSON.stringify(
        {
          status: result.status,
          truncated: result.truncated || undefined,
          body: result.body
        },
        null,
        2
      );
      return {
        isError: result.status >= 400,
        content: [{ type: "text" as const, text }]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Internal dispatch failed: ${err?.message || String(err)}` }]
      };
    }
  };
}
