import axios from "axios";
import { Environment } from "../../../shared/helpers/index.js";

// Mirrors today's Caddy semantics: apex domains only (loadPairs excludes www.* rows),
// with www served via an apex redirect (parity with CaddyHelper's auto www redirects).
export class VercelHelper {
  private static base = "https://api.vercel.com";

  private static qs() {
    return Environment.vercelTeamId ? "?teamId=" + Environment.vercelTeamId : "";
  }

  private static headers() {
    return { Authorization: "Bearer " + Environment.vercelToken };
  }

  static isConfigured() {
    return !!(Environment.vercelToken && Environment.vercelProjectId);
  }

  static async addDomain(domainName: string) {
    if (!this.isConfigured()) return;
    const name = (domainName || "").toLowerCase().trim();
    if (!name || name.startsWith("www.")) return; // parity with Caddy loadPairs www exclusion; www served via apex redirect
    const url = this.base + "/v10/projects/" + Environment.vercelProjectId + "/domains" + this.qs();
    await this.post(url, { name });
    await this.post(url, { name: "www." + name, redirect: name });
  }

  static async removeDomain(domainName: string) {
    if (!this.isConfigured()) return;
    const name = (domainName || "").toLowerCase().trim();
    if (!name || name.startsWith("www.")) return;
    await this.del(name);
    await this.del("www." + name);
  }

  private static async post(url: string, data: any) {
    try {
      await axios.post(url, data, { headers: this.headers(), timeout: 10000 });
    } catch (err: any) {
      if (err?.response?.status === 409) return; // already added
      throw err;
    }
  }

  private static async del(name: string) {
    const url = this.base + "/v9/projects/" + Environment.vercelProjectId + "/domains/" + encodeURIComponent(name) + this.qs();
    try {
      await axios.delete(url, { headers: this.headers(), timeout: 10000 });
    } catch (err: any) {
      if (err?.response?.status === 404) return; // already gone
      throw err;
    }
  }
}
