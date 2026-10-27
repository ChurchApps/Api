import { z } from "zod";
import { dispatch } from "../internalDispatch.js";
import { forwardToLessons, isLessonsPath, McpPrincipal } from "../lessonsProxy.js";

// Blocked: provider webhooks need raw signed bodies; OAuth manages client credentials; credential endpoints are never needed by an already-authenticated session.
const BLOCKLIST: RegExp[] = [
  /^\/giving\/donate\/webhook\//i,
  /^\/membership\/oauth\/clients/i,
  /^\/membership\/users\/(login|verifyCredentials|forgot|verifyCode|register|checkEmail|setPasswordGuid)\b/i,
  /^\/mcp\b/i
];

export const apiCallSchema = {
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).describe("HTTP verb."),
  path: z.string().describe("Path including any module prefix, e.g. '/membership/people', '/membership/people/abc123', or '/lessons/classrooms' for FreePlay."),
  query: z.record(z.any()).optional().describe("Optional query-string parameters as a flat object."),
  body: z.any().optional().describe("Optional JSON request body. For most POST endpoints this is an array of model objects.")
};

export function makeApiCallHandler(getAuthorization: () => string | undefined, getClientIp: () => string = () => "", getPrincipal: () => McpPrincipal | undefined = () => undefined) {
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

    if (isLessonsPath(path)) return callLessons(args, path, getPrincipal());

    try {
      const result = await dispatch({
        method: args.method,
        path,
        query: args.query,
        body: args.body,
        authorization: auth,
        clientIp: getClientIp()
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
      console.error("MCP api_call dispatch failed:", err);
      const timedOut = /timed out/i.test(err?.message || "");
      return {
        isError: true,
        content: [{ type: "text" as const, text: timedOut ? "Internal dispatch timed out." : "Internal dispatch failed." }]
      };
    }
  };
}

async function callLessons(args: { method: string; query?: Record<string, any>; body?: any }, path: string, principal: McpPrincipal | undefined) {
  if (!principal?.id || !principal?.churchId) {
    return { isError: true, content: [{ type: "text" as const, text: "This MCP session has no signed-in user to forward to FreePlay." }] };
  }
  try {
    const result = await forwardToLessons({ method: args.method, path, query: args.query, body: args.body, principal });
    const text = JSON.stringify({ status: result.status, truncated: result.truncated || undefined, body: result.body }, null, 2);
    return { isError: result.status >= 400, content: [{ type: "text" as const, text }] };
  } catch (err: any) {
    console.error("MCP api_call lessons forward failed:", err);
    const timedOut = err?.name === "TimeoutError" || /timed? ?out/i.test(err?.message || "");
    return { isError: true, content: [{ type: "text" as const, text: timedOut ? "FreePlay request timed out." : "FreePlay request failed." }] };
  }
}
