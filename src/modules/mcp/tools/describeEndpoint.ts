import { z } from "zod";
import { getRouteInventory } from "../RouteInventory.js";
import { lookupExample } from "../examples.js";

export const describeEndpointSchema = {
  method: z.string().describe("HTTP verb, e.g. 'GET' or 'POST'."),
  path: z.string().describe("Full path as returned by list_endpoints, e.g. '/membership/people/:id'.")
};

export async function describeEndpointHandler(args: { method: string; path: string }) {
  const inv = getRouteInventory();
  const method = args.method.toUpperCase();
  const entry = inv.find((r) => r.method === method && r.path === args.path);

  if (!entry) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: `No registered endpoint matches ${method} ${args.path}. Call list_endpoints to discover available routes.` }]
    };
  }

  const example = lookupExample(method, args.path);
  const text = JSON.stringify(
    {
      method: entry.method,
      path: entry.path,
      controller: entry.controllerName + "." + entry.methodName,
      likelyScopes: entry.scopes,
      example: example ?? {
        summary: "No curated example. Call a GET endpoint first to see the response shape, then mirror it in your POST/PUT body.",
        notes: "Request bodies are JSON. Most POST endpoints accept an array of model objects (omit id to create, include id to update)."
      }
    },
    null,
    2
  );
  return { content: [{ type: "text" as const, text }] };
}
