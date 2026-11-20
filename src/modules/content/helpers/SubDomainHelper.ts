import axios from "axios";
import { Environment } from "../../../shared/helpers/Environment.js";

export class SubDomainHelper {
  static subDomains: Record<string, string> = {};
  static churchIds: Record<string, string> = {};

  private static remember(churchId: string, subDomain: string) {
    if (Object.keys(this.subDomains).length > 5000) {
      this.subDomains = {};
      this.churchIds = {};
    }
    this.subDomains[churchId] = subDomain;
    this.churchIds[subDomain] = churchId;
  }

  public static async get(churchId: string) {
    let result = "";
    if (this.subDomains[churchId] !== undefined) result = this.subDomains[churchId];
    else {
      const apiUrl = Environment.membershipApi;
      const url = apiUrl + "/churches/lookup/?id=" + encodeURIComponent(churchId.toString());
      const json = (await axios.get<{ subDomain?: string }>(url)).data;
      result = json.subDomain;
      this.remember(churchId, result);
    }
    return result;
  }

  public static async getId(subDomain: string) {
    let result = "";
    if (this.churchIds[subDomain] !== undefined) result = this.churchIds[subDomain];
    else {
      const apiUrl = Environment.membershipApi;
      const url = apiUrl + "/churches/lookup/?subDomain=" + encodeURIComponent(subDomain);
      const json = (await axios.get<{ id?: string }>(url)).data;
      if (json.id) {
        result = json.id;
        this.remember(result, subDomain);
      }
    }
    return result;
  }
}
