// OAuth / API-key scopes. A scope is a FILTER over the RBAC permission set: it
// can only narrow a credential's permissions, never grant. Applied when an
// OAuth JWT is minted and when an API key is resolved — checkAccess is unchanged.
//
// A scope maps to {contentType, action} pairs. Matching against a permission
// string ignores its apiName prefix and contentId segment.

interface PermPair { contentType: string; action: string; }

// --- read pair groups (View-style actions) -------------------------------

const peopleRead: PermPair[] = [
  { contentType: "People", action: "View" },
  { contentType: "People", action: "View Members" },
  { contentType: "Group Members", action: "View" }
];

const groupsRead: PermPair[] = [{ contentType: "Group Members", action: "View" }];

const donationsRead: PermPair[] = [
  { contentType: "Donations", action: "View" },
  { contentType: "Donations", action: "View Summary" }
];

const attendanceRead: PermPair[] = [
  { contentType: "Attendance", action: "View" },
  { contentType: "Attendance", action: "View Summary" }
];

const contentRead: PermPair[] = [{ contentType: "Registrations", action: "View" }];

const messagingRead: PermPair[] = [{ contentType: "Messaging", action: "View" }];

const rolesRead: PermPair[] = [{ contentType: "Roles", action: "View" }];

const settingsRead: PermPair[] = [{ contentType: "Settings", action: "View" }];

// --- the catalog ----------------------------------------------------------
// `write` scopes include their matching `read` pairs — a connector that
// writes a resource almost always needs to read it back.

export const SCOPE_CATALOG: Record<string, PermPair[]> = {
  "people:read": peopleRead,
  "people:write": [
    ...peopleRead,
    { contentType: "People", action: "Edit" },
    { contentType: "People", action: "Edit Self" },
    { contentType: "Households", action: "Edit" },
    { contentType: "Group Members", action: "Edit" }
  ],

  "groups:read": groupsRead,
  "groups:write": [
    ...groupsRead,
    { contentType: "Groups", action: "Edit" },
    { contentType: "Group Members", action: "Edit" }
  ],

  "donations:read": donationsRead,
  "donations:write": [...donationsRead, { contentType: "Donations", action: "Edit" }],

  "attendance:read": attendanceRead,
  "attendance:write": [
    ...attendanceRead,
    { contentType: "Attendance", action: "Edit" },
    { contentType: "Attendance", action: "Checkin" },
    { contentType: "Services", action: "Edit" }
  ],

  // Forms have no View permission — read access is gated by Edit in the RBAC
  // catalog, so only a write scope is exposed.
  "forms:write": [
    { contentType: "Forms", action: "Edit" },
    { contentType: "Forms", action: "Admin" },
    { contentType: "Plans", action: "Edit" }
  ],

  "content:read": contentRead,
  "content:write": [
    ...contentRead,
    { contentType: "Content", action: "Edit" },
    { contentType: "StreamingServices", action: "Edit" },
    { contentType: "Chat", action: "Host" },
    { contentType: "Registrations", action: "Edit" },
    { contentType: "Schedules", action: "Edit" }
  ],

  // Backwards compatible for FreeShow sync
  plans: [
    ...groupsRead,
    ...messagingRead,
    { contentType: "Content", action: "Edit" },
    { contentType: "Plans", action: "Edit" },
    { contentType: "Schedules", action: "Edit" },
    { contentType: "Chat", action: "Host" },
    { contentType: "Messaging", action: "Edit" }
  ],

  "messaging:read": messagingRead,
  "messaging:write": [
    ...messagingRead,
    { contentType: "Messaging", action: "Edit" },
    { contentType: "Texting", action: "Send" }
  ],

  "roles:read": rolesRead,
  "roles:write": [...rolesRead, { contentType: "Roles", action: "Edit" }],

  "settings:read": settingsRead,
  "settings:write": [...settingsRead, { contentType: "Settings", action: "Edit" }]
};

// Server/Domain admin permissions are intentionally absent — a scoped
// credential can never scope *up* to site administration.

/** All recognised scope names — for a consent screen or key-creation UI. */
export function listAllScopes(): string[] {
  return Object.keys(SCOPE_CATALOG);
}

/** Splits a stored/requested scope string into a deduped scope list. */
export function parseScopes(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const parts = raw.split(/[\s,]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  return Array.from(new Set(parts));
}

/** Scopes that aren't in the catalog (e.g. `offline_access`) — not errors. */
export function unknownScopes(scopes: string[]): string[] {
  return scopes.filter((s) => !SCOPE_CATALOG[s]);
}

// A perm-string is `[apiName_]contentType_<contentId>_action`. contentType and
// action may contain spaces but never underscores; apiName and contentId never
// contain underscores — so splitting on "_" is safe and positional.
function pairKey(contentType: string, action: string): string {
  return contentType + "|" + action;
}

/**
 * Intersects permission strings with what the given scopes allow.
 *
 * Empty/absent scopes → returns permStrings unchanged (full access). This is
 * the deliberate backward-compatible default: existing OAuth tokens and
 * device-flow clients that never requested scopes keep working. Only a
 * present, non-empty scope set narrows the permission array. Unknown scopes
 * contribute nothing and are silently ignored.
 */
export function filterPermissionsByScopes(permStrings: string[], scopes: string[]): string[] {
  if (!scopes || scopes.length === 0) return permStrings;

  const allowed = new Set<string>();
  scopes.forEach((scope) => {
    SCOPE_CATALOG[scope]?.forEach((pair) => allowed.add(pairKey(pair.contentType, pair.action)));
  });
  if (allowed.size === 0) return [];

  return permStrings.filter((perm) => {
    const parts = perm.split("_");
    if (parts.length < 3) return false;
    const contentType = parts[parts.length - 3];
    const action = parts[parts.length - 1];
    return allowed.has(pairKey(contentType, action));
  });
}
