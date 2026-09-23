import https from "https";
import dns from "dns";
import { UrlValidator } from "./UrlValidator.js";

export interface SafePostResult {
  status: number;
  body: string;
}

// POSTs to a church-supplied URL without following redirects, and validates the IP actually
// being connected to (not a separate pre-flight lookup) so DNS rebinding can't reach internal hosts.
export class SafeHttp {
  public static guardedLookup(hostname: string, options: any, callback: any): void {
    dns.lookup(hostname, options, (err: any, address: any, family?: number) => {
      if (err) return callback(err, address, family);
      const list: { address: string }[] = Array.isArray(address) ? address : [{ address }];
      if (list.length === 0 || list.some((a) => UrlValidator.isPrivateIp(a.address))) {
        return callback(new Error("Blocked: webhook URL resolves to a private address"), address, family);
      }
      callback(null, address, family);
    });
  }

  public static post(rawUrl: string, headers: Record<string, string>, body: string, timeoutMs: number, maxBody: number): Promise<SafePostResult> {
    return new Promise((resolve, reject) => {
      let url: URL;
      try {
        url = new URL(rawUrl);
      } catch {
        return reject(new Error("Invalid URL"));
      }
      if (url.protocol !== "https:") return reject(new Error("Webhook URL must use https"));
      if (UrlValidator.isBlockedHostname(url.hostname)) return reject(new Error("Blocked: webhook URL host is not allowed"));

      const req = https.request(url, {
        method: "POST",
        headers: { ...headers, "Content-Length": Buffer.byteLength(body).toString() },
        lookup: SafeHttp.guardedLookup as any,
        timeout: timeoutMs
      }, (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          if (text.length < maxBody) text += chunk;
          if (text.length >= maxBody) res.destroy();
        });
        const done = () => resolve({ status: res.statusCode || 0, body: text.slice(0, maxBody) });
        res.on("end", done);
        res.on("close", done);
        res.on("error", done);
      });
      req.on("timeout", () => req.destroy(new Error("Request timed out")));
      req.on("error", reject);
      req.end(body);
    });
  }
}
