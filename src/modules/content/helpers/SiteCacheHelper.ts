import axios from "axios";
import { Environment } from "../../../shared/helpers/Environment.js";
import { SubDomainHelper } from "./SubDomainHelper.js";

export class SiteCacheHelper {
  static bump(churchId: string): void {
    void this.revalidate(churchId);
  }

  static async revalidate(churchId: string): Promise<void> {
    if (!churchId) return;
    try {
      const subDomain = await SubDomainHelper.get(churchId);
      if (!subDomain) return;
      const template = Environment.b1AppRoot || "https://{subdomain}.b1.church";
      const base = template.split("{subdomain}").join(subDomain).replace(/\/$/, "");
      const url = base + "/api/revalidate/" + encodeURIComponent(subDomain);
      await axios.post(url, null, { timeout: 4000 });
    } catch {
      /* best-effort — save must not fail if B1App is unreachable */
    }
  }
}
