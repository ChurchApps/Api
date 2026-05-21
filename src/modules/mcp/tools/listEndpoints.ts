import { z } from "zod";
import { getRouteInventory } from "../RouteInventory.js";

export const listEndpointsSchema = {
  filter: z.string().optional().describe("Case-insensitive substring matched against the path. E.g. 'people', 'donations'."),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).optional().describe("Limit to a single HTTP verb.")
};

export async function listEndpointsHandler(args: { filter?: string; method?: string }) {
  const inv = getRouteInventory();
  const needle = args.filter?.toLowerCase();
  const verb = args.method?.toUpperCase();

  const matches = inv.filter((r) => {
    if (needle && !r.path.toLowerCase().includes(needle)) return false;
    if (verb && r.method !== verb) return false;
    return true;
  });

  const text = JSON.stringify(
    {
      total: matches.length,
      endpoints: matches.map((r) => ({
        method: r.method,
        path: r.path,
        controller: r.controllerName + "." + r.methodName,
        likelyScopes: r.scopes
      }))
    },
    null,
    2
  );
  return { content: [{ type: "text" as const, text }] };
}
