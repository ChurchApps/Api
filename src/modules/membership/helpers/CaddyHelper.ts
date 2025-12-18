import { Repos } from "../repositories";
import { RepoManager } from "../../../shared/infrastructure";
import axios from "axios";
import { Environment } from "../../../shared/helpers";

export interface HostDial {
  host: string;
  dial: string;
}

export class CaddyHelper {
  private static getAdminBaseUrl() {
    return "http://" + Environment.caddyHost + ":" + Environment.caddyPort;
  }

  // Call once after Caddy restarts to set up storage and server structure
  static async initializeCaddy() {
    if (!Environment.caddyHost || !Environment.caddyPort) return;

    const baseUrl = this.getAdminBaseUrl();

    // Configure S3 storage for certificates
    await axios.put(baseUrl + "/config/storage", {
      module: "s3",
      bucket: "churchapps-caddy-certs",
      region: "us-east-2",
      prefix: "certs"
    });

    // Create proxy server on :443 with empty routes (will be populated by updateCaddy)
    await axios.put(baseUrl + "/config/apps/http/servers/proxy", {
      listen: [":443"],
      routes: []
    });

    // Create HTTP to HTTPS redirect server on :80
    await axios.put(baseUrl + "/config/apps/http/servers/http_redirect", {
      listen: [":80"],
      routes: [
        {
          handle: [
            {
              handler: "static_response",
              status_code: 308,
              headers: {
                Location: ["https://{http.request.host}{http.request.uri}"]
              }
            }
          ]
        }
      ]
    });
  }

  // Updates only the routes array on the proxy server - safe to call repeatedly
  static async updateCaddy() {
    if (!Environment.caddyHost || !Environment.caddyPort) return;

    const adminUrl = this.getAdminBaseUrl() + "/config/apps/http/servers/proxy/routes";
    const routes = await this.generateRoutes();
    await axios.patch(adminUrl, routes);
  }

  // Generates the full routes array from the database
  static async generateRoutes() {
    const repos = await RepoManager.getRepos<Repos>("membership");
    const hostDials: HostDial[] = (await repos.domain.loadPairs()) as HostDial[];
    const routes: any[] = [];

    // Add exact host routes first (order matters in Caddy)
    hostDials.forEach((hd) => {
      routes.push(this.getRoute(hd.host, hd.dial));
    });

    // Add www redirect routes after
    hostDials.forEach((hd) => {
      routes.push(this.getWwwRoute(hd.host));
    });

    return routes;
  }

  // Legacy method for backwards compatibility (used by /caddy and /test endpoints)
  static async generateJsonData() {
    const routes = await this.generateRoutes();
    return {
      apps: {
        http: {
          servers: {
            proxy: {
              listen: [":443"],
              routes
            }
          }
        }
      }
    };
  }

  private static getRoute(host: string, dial: string) {
    // Parse the dial to get a clean upstream host
    const upstreamHost = dial.includes(":")
      ? dial
      : dial + ":443";

    return {
      match: [{ host: [host] }],
      handle: [
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: upstreamHost }],
          transport: {
            protocol: "http",
            tls: {}
          },
          headers: {
            request: {
              set: {
                Host: ["{http.reverse_proxy.upstream.hostport}"]
              }
            }
          }
        }
      ],
      terminal: true
    };
  }

  private static getWwwRoute(host: string) {
    return {
      match: [{ host: ["www." + host] }],
      handle: [
        {
          handler: "static_response",
          status_code: 302,
          headers: {
            Location: ["https://" + host + "{http.request.uri}"]
          }
        }
      ],
      terminal: true
    };
  }
}
