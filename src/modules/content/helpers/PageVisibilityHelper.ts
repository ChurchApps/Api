export const PUBLIC_VISIBILITY = "everyone";

export interface PageViewer {
  churchId?: string;
  personId?: string;
  membershipStatus?: string;
  groupIds?: string[];
}

interface VisibilityGated {
  churchId?: string;
  visibility?: string;
  groupIds?: string;
}

// Hard access gate (unlike links nav filter): visibility !== "everyone" requires auth into the page's church.
export function canViewPage(page: VisibilityGated, au?: PageViewer | null): boolean {
  const visibility = page.visibility || PUBLIC_VISIBILITY;
  if (visibility === PUBLIC_VISIBILITY) return true;
  if (!au?.churchId || au.churchId !== page.churchId) return false;

  switch (visibility) {
    case "visitors": return !!au.personId;
    case "members": return true; // any authenticated user of the church
    case "staff": return au.membershipStatus?.toLowerCase() === "staff";
    case "team": return true; // group tags aren't in the JWT; church auth is the best we can verify
    case "groups": {
      if (!page.groupIds) return false;
      try {
        const ids: string[] = JSON.parse(page.groupIds);
        return ids.length > 0 && ids.some((gid) => au.groupIds?.includes(gid));
      } catch {
        return false;
      }
    }
    default: return true;
  }
}
