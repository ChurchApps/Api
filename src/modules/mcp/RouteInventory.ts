// Builds a static inventory of every HTTP route registered by an
// inversify-express-utils @controller / @httpVerb decorator. Run once at
// startup AFTER all controller modules have been imported (the decorators
// register themselves on import). The result is consumed by the MCP tools so
// the LLM can discover what endpoints are callable via api_call.

import "reflect-metadata";

// String literals copied from inversify-express-utils/lib/cjs/constants.js —
// importing the constants module pulls in the library's CommonJS entry which
// fights NodeNext resolution. Pin the strings; they are part of the package's
// public-ish surface and have not changed across major versions.
const CONTROLLER_METADATA_KEY = "inversify-express-utils:controller";
const CONTROLLER_METHOD_METADATA_KEY = "inversify-express-utils:controller-method";

export interface RouteEntry {
  method: string; // upper-case HTTP verb
  path: string;   // full URL path including controller prefix, e.g. "/membership/people/:id"
  controllerName: string;
  methodName: string;
  scopes: string[]; // best-effort scope guess derived from the path prefix
}

interface RawControllerMeta {
  path: string;
  target: { name: string };
  middleware: unknown[];
}

interface RawMethodMeta {
  key: string;
  method: string;
  path: string;
  middleware: unknown[];
  target: { constructor: { name: string } };
}

let cached: RouteEntry[] | null = null;

export function buildRouteInventory(): RouteEntry[] {
  const controllers = (Reflect.getMetadata(CONTROLLER_METADATA_KEY, Reflect) as RawControllerMeta[]) || [];
  const entries: RouteEntry[] = [];

  for (const ctrl of controllers) {
    const methods = (Reflect.getOwnMetadata(CONTROLLER_METHOD_METADATA_KEY, ctrl.target) as RawMethodMeta[]) || [];
    for (const m of methods) {
      const fullPath = joinPath(ctrl.path, m.path);
      entries.push({
        method: m.method.toUpperCase(),
        path: fullPath,
        controllerName: ctrl.target.name,
        methodName: m.key,
        scopes: scopesForPath(fullPath)
      });
    }
  }

  entries.sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)));
  cached = entries;
  return entries;
}

export function getRouteInventory(): RouteEntry[] {
  if (!cached) return buildRouteInventory();
  return cached;
}

function joinPath(prefix: string, suffix: string): string {
  const p = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  if (!suffix || suffix === "/") return p || "/";
  const s = suffix.startsWith("/") ? suffix : "/" + suffix;
  return p + s;
}

// Path → likely scope mapping. Heuristic only — the real authorization check
// happens inside each controller via au.checkAccess(Permissions.x). This is a
// hint for the LLM so it picks the right API key to use.
function scopesForPath(path: string): string[] {
  const lc = path.toLowerCase();
  if (lc.startsWith("/membership/people")) return ["people:read", "people:write"];
  if (lc.startsWith("/membership/households")) return ["people:read", "people:write"];
  if (lc.startsWith("/membership/groupmembers")) return ["groups:read", "groups:write"];
  if (lc.startsWith("/membership/groups")) return ["groups:read", "groups:write"];
  if (lc.startsWith("/membership/forms")) return ["forms:write"];
  if (lc.startsWith("/membership/formsubmissions")) return ["forms:write"];
  if (lc.startsWith("/membership/questions")) return ["forms:write"];
  if (lc.startsWith("/membership/answers")) return ["forms:write"];
  if (lc.startsWith("/membership/roles")) return ["roles:read", "roles:write"];
  if (lc.startsWith("/membership/settings")) return ["settings:read", "settings:write"];
  if (lc.startsWith("/giving/donations") || lc.startsWith("/giving/donate")) return ["donations:read", "donations:write"];
  if (lc.startsWith("/giving/subscriptions")) return ["donations:read", "donations:write"];
  if (lc.startsWith("/giving/funds")) return ["donations:read"];
  if (lc.startsWith("/attendance")) return ["attendance:read", "attendance:write"];
  if (lc.startsWith("/content")) return ["content:read", "content:write"];
  if (lc.startsWith("/messaging")) return ["messaging:read", "messaging:write"];
  return [];
}
