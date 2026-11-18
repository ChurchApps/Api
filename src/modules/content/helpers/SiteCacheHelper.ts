import axios from "axios";
import { SubDomainHelper } from "./SubDomainHelper.js";
import { AppUrlHelper } from "../../../shared/helpers/AppUrlHelper.js";

export class SiteCacheHelper {
  static bump(churchId: string): void {
    void this.revalidate(churchId);
  }

  static async revalidate(churchId: string): Promise<void> {
    if (!churchId) return;
    try {
      const subDomain = await SubDomainHelper.get(churchId);
      if (!subDomain) return;
      const url = AppUrlHelper.b1AppUrl(subDomain) + "/api/revalidate/" + encodeURIComponent(subDomain);
      await axios.post(url, null, { timeout: 4000 });
    } catch {
      /* best-effort — save must not fail if B1App is unreachable */
    }
  }
}
