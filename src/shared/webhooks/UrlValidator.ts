import dns from "dns/promises";
import net from "net";

// SSRF guard for webhook destination URLs. Webhook targets are church-supplied,
// so they must never be allowed to reach internal infrastructure or cloud
// metadata endpoints. validateFormat() is a synchronous registration-time
// check; resolvesToPrivate() must additionally run before every delivery to
// defend against DNS rebinding.
export class UrlValidator {
  // Returns an error message if the URL is unacceptable, or null if it passes.
  public static async validate(rawUrl: string): Promise<string | null> {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return "Invalid URL";
    }
    if (parsed.protocol !== "https:") return "Webhook URL must use https";
    if (UrlValidator.isBlockedHostname(parsed.hostname)) return "Webhook URL host is not allowed";
    if (await UrlValidator.resolvesToPrivate(parsed.hostname)) return "Webhook URL resolves to a private address";
    return null;
  }

  public static isBlockedHostname(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return true;
    if (net.isIP(host)) return UrlValidator.isPrivateIp(host);
    return false;
  }

  // Resolves the hostname and reports whether any resolved address is private.
  // Fails closed (returns true) if resolution fails.
  public static async resolvesToPrivate(hostname: string): Promise<boolean> {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (net.isIP(host)) return UrlValidator.isPrivateIp(host);
    try {
      const addresses = await dns.lookup(host, { all: true });
      if (addresses.length === 0) return true;
      return addresses.some((a) => UrlValidator.isPrivateIp(a.address));
    } catch {
      return true;
    }
  }

  public static isPrivateIp(ip: string): boolean {
    const version = net.isIP(ip);
    if (version === 4) return UrlValidator.isPrivateIpv4(ip);
    if (version === 6) return UrlValidator.isPrivateIpv6(ip);
    return true;
  }

  private static isPrivateIpv4(ip: string): boolean {
    const parts = ip.split(".").map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => isNaN(p))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true; // unspecified, private, loopback
    if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  private static isPrivateIpv6(ip: string): boolean {
    const addr = ip.toLowerCase();
    if (addr === "::1" || addr === "::") return true; // loopback, unspecified
    if (addr.startsWith("fe80")) return true; // link-local
    if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // unique local
    const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return UrlValidator.isPrivateIpv4(mapped[1]);
    return false;
  }
}
