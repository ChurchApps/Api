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
