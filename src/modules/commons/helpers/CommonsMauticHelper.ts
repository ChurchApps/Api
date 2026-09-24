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
      if (!email) return;
      // createAndTag upserts: tags the existing contact, or creates one first.
      // (Seen in production: a song submitted before the contact existed lost its tag.)
      await MauticHelper.createAndTag(email, users[0].firstName, users[0].lastName, tag);
    } catch (e) {
      console.error("[CommonsMauticHelper] tag failed:", e);
    }
  };
}
