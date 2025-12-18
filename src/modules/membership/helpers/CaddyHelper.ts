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

  private static sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper to PUT config, ignoring 409 conflict if key already exists
  private static async putConfig(url: string, data: any) {
    try {
      await axios.put(url, data, { timeout: 10000 });
    } catch (err: any) {
      // 409 means key already exists - that's fine, use PATCH to update
      if (err?.response?.status === 409) {
        await axios.patch(url, data, { timeout: 10000 });
      } else {
        throw err;
      }
    }
  }

  // Call once after Caddy restarts to set up storage and server structure
  static async initializeCaddy() {
    if (!Environment.caddyHost || !Environment.caddyPort) return;

    const baseUrl = this.getAdminBaseUrl();
    const results: string[] = [];

    try {
      // Configure S3 storage for certificates
      await this.putConfig(baseUrl + "/config/storage", {
        module: "s3",
        bucket: "churchapps-caddy-certs",
        region: "us-east-2",
        prefix: "certs"
      });
      results.push("storage: ok");
      await this.sleep(500); // Let Caddy stabilize after storage change

      // Configure TLS automation with ACME email for Let's Encrypt
      await this.putConfig(baseUrl + "/config/apps/tls/automation/policies", [
        {
          issuers: [
            {
              module: "acme",
              email: "support@livecs.org"
            }
          ]
        }
      ]);
      results.push("tls: ok");
      await this.sleep(500);

      // Create proxy server on :443 with empty routes (will be populated by updateCaddy)
      await this.putConfig(baseUrl + "/config/apps/http/servers/proxy", {
        listen: [":443"],
        routes: []
      });
      results.push("proxy: ok");
      await this.sleep(500);

      // Create HTTP to HTTPS redirect server on :80
      await this.putConfig(baseUrl + "/config/apps/http/servers/http_redirect", {
        listen: [":80"],
        routes: [
          {
            match: [
              {
                path: ["/.well-known/acme-challenge/*"]
              }
            ],
            handle: [
              {
                handler: "static_response",
                status_code: 200
              }
            ]
          },
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
      results.push("http_redirect: ok");

      return { success: true, results };
    } catch (err: any) {
      return {
        success: false,
        results,
        error: err?.message || "Unknown error",
        step: results.length
      };
    }
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
    // Parse the dial to get host and port separately
    const dialHost = dial.includes(":") ? dial.split(":")[0] : dial;
    const dialPort = dial.includes(":") ? dial.split(":")[1] : "443";

    return {
      match: [{ host: [host] }],
      handle: [
        {
          handler: "reverse_proxy",
          upstreams: [{ dial: `${dialHost}:${dialPort}` }],
          transport: {
            protocol: "http",
            tls: {
              server_name: dialHost
            }
          },
          headers: {
            request: {
              set: {
                Host: [dialHost]
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
