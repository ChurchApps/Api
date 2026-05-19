// Builds the flat permission-key strings that au.checkAccess() matches against,
// from resolved RBAC permissions. Shared by JWT minting and API-key auth.

interface PermissionLike {
  apiName?: string;
  contentType?: string;
  contentId?: string;
  action?: string;
}

interface ApiLike {
  keyName?: string;
  permissions?: PermissionLike[];
}

// The `String(contentId).replace("null", "")` quirk is preserved verbatim —
// changing it would alter every existing perm-string.
export function buildPermStrings(apis: ApiLike[] | undefined): string[] {
  const result: string[] = [];
  apis?.forEach((api) => {
    api.permissions?.forEach((p) => {
      let permString = p.contentType + "_" + String(p.contentId).replace("null", "") + "_" + p.action;
      if (p.apiName) permString = p.apiName + "_" + permString;
      result.push(permString);
    });
  });
  return result;
}
