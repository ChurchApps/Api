import axios from "axios";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { Repos } from "../repositories/index.js";
import { Domain } from "../models/index.js";
import { UrlValidator } from "../../../shared/webhooks/UrlValidator.js";

export class DomainHealthHelper {

  static async verifyDomain(domainName: string): Promise<boolean> {
    const url = "https://" + domainName + "/.well-known/acme-challenge/";
    if (await UrlValidator.validate(url)) return false;
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        validateStatus: () => true
      });
      const contentType = response.headers["content-type"] || "";
      if (contentType.includes("application/json") && response.data && typeof response.data === "object" && "error" in response.data) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  static async checkUncheckedDomains(): Promise<Domain[]> {
    const repos = await RepoManager.getRepos<Repos>("membership");
    const domains: Domain[] = await repos.domain.loadUnchecked();

    for (const domain of domains) {
      if (!domain.domainName || !domain.id) continue;
      const isValid = await this.verifyDomain(domain.domainName);
      domain.lastChecked = new Date();
      domain.isStale = !isValid;
      await repos.domain.save(domain);
    }

    return domains;
  }
}
