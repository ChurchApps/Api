import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";

/** membership userId → display name; unknown ids fall back to "a community member". */
export async function userNames(ids: (string | undefined)[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const out: Record<string, string> = {};
  if (!unique.length) return out;
  try {
    const repos = await RepoManager.getRepos<any>("membership");
    const users: any[] = await repos.user.loadByIds(unique);
    for (const u of users) out[u.id] = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "a community member";
  } catch { /* names are cosmetic */ }
  for (const id of unique) out[id] ||= "a community member";
  return out;
}

/**
 * Server admin by membership lookup. The WorshipCommons site signs in at user level, so its token carries no church
 * permissions and checkAccess(server.admin) is false there even for a server admin; B1 Admin's church token has them.
 */
export async function isServerAdmin(userId?: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const repos = await RepoManager.getRepos<any>("membership");
    const churches: any[] = await repos.rolePermission.loadForUser(userId, false);
    return churches.some((c) => c.apis?.some((a: any) => a.permissions?.some((p: any) => p.contentType === "Server" && p.action === "Admin")));
  } catch {
    return false;
  }
}
