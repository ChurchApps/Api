import { ArrayHelper } from "@churchapps/apihelper";
import { Repositories } from "../repositories";
import { RepositoryManager } from "../../../shared/infrastructure";
import { Church } from "../models";

export class ChurchHelper {
  static async selectSubDomain(name: string) {
    const subDomain = this.suggestSubDomain(name) || "church";
    const repos = await RepositoryManager.getRepositories<Repositories>("membership");
    const churches: Church[] = await repos.church.loadContainingSubDomain(subDomain);
    let result = subDomain;
    let i = 1;
    while (ArrayHelper.getOne(churches, "subDomain", result)) {
      result = subDomain + i.toString();
      i++;
    }
    return result;
  }

  static suggestSubDomain(name: string) {
    const result = name
      .toLowerCase()
      .replaceAll("christian", "")
      .replaceAll("church", "")
      .replaceAll(" ", "")
      .replace(/[^A-Za-z0-9]/g, "");
    return result;
  }

  static async appendLogos(churches: Church[]) {
    if (!churches || churches.length === 0) return;
    const ids = ArrayHelper.getIds(churches, "id");
    const repos = await RepositoryManager.getRepositories<Repositories>("membership");
    const settings = (await repos.setting.loadMulipleChurches(["logoLight", "logoDark"], ids)) as any[];
    settings.forEach((s: any) => {
      const church = ArrayHelper.getOne(churches, "id", s.churchId);
      if (church.settings === undefined) church.settings = [];
      church.settings.push(s);
    });
  }
}
