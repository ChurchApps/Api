import axios from "axios";
import { Environment } from "../../../shared/helpers/Environment.js";

export class SubDomainHelper {
  static subDomains: any = {};
  static churchIds: any = {};

  public static async get(churchId: string) {
    let result = "";
    if (this.subDomains[churchId] !== undefined) result = this.subDomains[churchId];
    else {
      const apiUrl = Environment.membershipApi;
      const url = apiUrl + "/churches/lookup/?id=" + churchId.toString();
      const json: any = (await axios.get(url)).data;
      result = json.subDomain;
      this.subDomains[churchId] = result;
      this.churchIds[result] = churchId;
    }
    return result;
  }

  public static async getId(subDomain: string) {
    let result = "";
    if (this.churchIds[subDomain] !== undefined) result = this.churchIds[subDomain];
    else {
      const apiUrl = Environment.membershipApi;
      const url = apiUrl + "/churches/lookup/?subDomain=" + subDomain;
      const json: any = (await axios.get(url)).data;
      if (json.id) {
        result = json.id;
        this.subDomains[result] = subDomain;
        this.churchIds[subDomain] = result;
      }
    }
    return result;
  }
}
