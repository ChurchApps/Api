import dns from "dns/promises";
import net from "net";

// SSRF guard for webhook destination URLs. Webhook targets are church-supplied,
// so they must never be allowed to reach internal infrastructure or cloud
// metadata endpoints. validateFormat() is a synchronous registration-time
// check; resolvesToPrivate() must additionally run before every delivery to
// defend against DNS rebinding.
export class UrlValidator {
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
    if (a === 192 && b === 0 && parts[2] === 0) return true; // IETF protocol assignments
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  private static isPrivateIpv6(ip: string): boolean {
    const h = UrlValidator.ipv6Hextets(ip);
    if (!h) return true;
    const embeddedV4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
    if (h.slice(0, 7).every((x) => x === 0) && h[7] <= 1) return true; // unspecified, loopback
    if (h.slice(0, 5).every((x) => x === 0) && (h[5] === 0xffff || h[5] === 0)) return UrlValidator.isPrivateIpv4(embeddedV4(h[6], h[7])); // v4-mapped / v4-compatible
    if (h[0] === 0x64 && h[1] === 0xff9b) return true; // NAT64 (well-known + local-use)
    if (h[0] === 0x2002) return UrlValidator.isPrivateIpv4(embeddedV4(h[1], h[2])); // 6to4
    if ((h[0] & 0xffc0) === 0xfe80 || (h[0] & 0xffc0) === 0xfec0) return true; // link-local, site-local
    if ((h[0] & 0xfe00) === 0xfc00) return true; // unique local
    if ((h[0] & 0xff00) === 0xff00) return true; // multicast
    return false;
  }

  private static ipv6Hextets(ip: string): number[] | null {
    let addr = ip.toLowerCase().replace(/%.*$/, "");
    const v4 = addr.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (v4) {
      const p = v4[1].split(".").map((x) => parseInt(x, 10));
      if (p.length !== 4 || p.some((x) => isNaN(x) || x > 255)) return null;
      addr = addr.slice(0, -v4[1].length) + ((p[0] << 8) | p[1]).toString(16) + ":" + ((p[2] << 8) | p[3]).toString(16);
    }
    const halves = addr.split("::");
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(":") : [];
    const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
    const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
    if (fill < 0) return null;
    const parts = [...head, ...Array(fill).fill("0"), ...tail];
    if (parts.length !== 8) return null;
    const nums = parts.map((x) => parseInt(x, 16));
    return nums.some((x) => isNaN(x) || x < 0 || x > 0xffff) ? null : nums;
  }
}
