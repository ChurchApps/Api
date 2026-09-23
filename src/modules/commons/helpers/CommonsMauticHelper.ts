import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";
import { MauticHelper } from "../../membership/helpers/MauticHelper.js";

export class CommonsMauticHelper {
  /** Tags the Mautic contact for a membership user (fire and forget) so
   *  marketing can see product wins like saved songs and submissions. */
  static tagUser = async (userId: string | undefined, tag: string): Promise<void> => {
    try {
      if (!userId) return;
      const repos = await RepoManager.getRepos<any>("membership");
      const users: any[] = await repos.user.loadByIds([userId]);
      const email = users?.[0]?.email;
      if (email) await MauticHelper.updateContact(email, { tags: [tag] });
    } catch (e) {
      console.error("[CommonsMauticHelper] tag failed:", e);
    }
  };
}
