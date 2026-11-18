import { Environment } from "./Environment.js";

export class AppUrlHelper {
  /** The church's B1 member-site origin. B1APP_ROOT may hold a {subdomain} template (hosted) or a bare origin (self-hosted). */
  static b1AppUrl(subDomain: string): string {
    const template = Environment.b1AppRoot || "https://{subdomain}.b1.church";
    return template.split("{subdomain}").join(subDomain).replace(/\/$/, "");
  }
}
