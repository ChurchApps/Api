import { UrlValidator } from "../UrlValidator";
import { SafeHttp } from "../SafeHttp";

describe("UrlValidator.isPrivateIp", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "169.254.169.254",
    "192.168.0.1",
    "172.20.0.1",
    "100.64.0.1",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "ff02::1",
    "::ffff:169.254.169.254",
    "::ffff:a9fe:a9fe",
    "::ffff:7f00:1",
    "::a9fe:a9fe",
    "0:0:0:0:0:ffff:a9fe:a9fe",
    "64:ff9b::a9fe:a9fe",
    "2002:a9fe:a9fe::1"
  ])("blocks %s", (ip) => {
    expect(UrlValidator.isPrivateIp(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8", "2002:0808:0808::1"])("allows %s", (ip) => {
    expect(UrlValidator.isPrivateIp(ip)).toBe(false);
  });

  it("blocks the normalized bracketed mapped hostname", () => {
    expect(UrlValidator.isBlockedHostname(new URL("https://[::ffff:169.254.169.254]/").hostname)).toBe(true);
  });
});

describe("SafeHttp", () => {
  it("connect-time lookup rejects hosts that resolve to a private address", async () => {
    const err = await new Promise<any>((resolve) => SafeHttp.guardedLookup("localhost", { all: true }, (e: any) => resolve(e)));
    expect(err?.message).toMatch(/private address/);
    const err2 = await new Promise<any>((resolve) => SafeHttp.guardedLookup("localhost", {}, (e: any) => resolve(e)));
    expect(err2?.message).toMatch(/private address/);
  });

  it("refuses private IP literals and non-https", async () => {
    await expect(SafeHttp.post("https://[::ffff:a9fe:a9fe]/", {}, "{}", 2000, 100)).rejects.toThrow(/not allowed/);
    await expect(SafeHttp.post("http://example.com/", {}, "{}", 2000, 100)).rejects.toThrow(/https/);
  });
});
