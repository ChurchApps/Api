import axios from "axios";
import { RepoManager } from "../../../shared/infrastructure/index.js";
import { Repos } from "../repositories/index.js";
import { Domain } from "../models/index.js";

export class DomainHealthHelper {

  static async verifyDomain(domainName: string): Promise<boolean> {
    try {
      const response = await axios.get(`https://${domainName}/.well-known/acme-challenge/`, {
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
