// Forwards MCP api_call requests for /lessons/* to LessonsApi (lessons.church / FreePlay), a separate service.
//
// LessonsApi only accepts ChurchApps JWTs (it verifies with the shared JWT_SECRET and reads the principal straight
// from the token), so a cak_ API key can't be passed through. Instead we sign a short-lived JWT from the principal the
// Api already resolved for this MCP request. For API keys that principal's permissions are already narrowed by the
// key's scopes, so the forwarded token can never do more than the key itself.

import jwt from "jsonwebtoken";
import { Environment } from "../../shared/helpers/Environment.js";

export const LESSONS_PREFIX = "/lessons";

const MAX_BODY_BYTES = 64 * 1024;
const FORWARD_TIMEOUT_MS = 25000;
const FORWARD_JWT_TTL = "15m";

export interface McpPrincipal {
  id: string;
  churchId: string;
  personId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  permissions?: string[];
  groupIds?: string[];
  leaderGroupIds?: string[];
  membershipStatus?: string;
}

export interface LessonsForwardInput {
  method: string;
  path: string;
  query?: Record<string, any>;
  body?: any;
  principal: McpPrincipal;
}

export function isLessonsPath(path: string): boolean {
  return path === LESSONS_PREFIX || path.toLowerCase().startsWith(LESSONS_PREFIX + "/");
}

export function signLessonsJwt(principal: McpPrincipal): string {
  return jwt.sign(
    {
      id: principal.id,
      email: principal.email || "",
      firstName: principal.firstName || "",
      lastName: principal.lastName || "",
      churchId: principal.churchId,
      personId: principal.personId,
      permissions: principal.permissions || [],
      groupIds: principal.groupIds || [],
      leaderGroupIds: principal.leaderGroupIds || [],
      membershipStatus: principal.membershipStatus || ""
    },
    Environment.jwtSecret,
    { expiresIn: FORWARD_JWT_TTL }
  );
}

export async function forwardToLessons(input: LessonsForwardInput): Promise<{ status: number; body: any; truncated: boolean }> {
  if (!Environment.lessonsApi) throw new Error("lessonsApi is not configured");

  const url = new URL(Environment.lessonsApi.replace(/\/$/, "") + input.path.substring(LESSONS_PREFIX.length));
  for (const [k, v] of Object.entries(input.query || {})) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, String(item)));
    else url.searchParams.append(k, String(v));
  }

  const method = input.method.toUpperCase();
  const hasBody = input.body !== undefined && method !== "GET" && method !== "DELETE";
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + signLessonsJwt(input.principal),
      ...(hasBody ? { "Content-Type": "application/json" } : {})
    },
    body: hasBody ? JSON.stringify(input.body) : undefined,
    signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS)
  });

  const raw = await response.text();
  const truncated = Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES;
  const text = truncated ? Buffer.from(raw, "utf8").subarray(0, MAX_BODY_BYTES).toString("utf8") : raw;
  let body: any = text;
  if (!truncated) {
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
  }
  return { status: response.status, body, truncated };
}
