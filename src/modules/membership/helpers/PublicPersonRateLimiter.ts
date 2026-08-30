export class PublicPersonRateLimiter {
  private static hits = new Map<string, number[]>();
  static windowMs = 10 * 60 * 1000;
  static maxHits = 10;

  static allow(ip: string, churchId: string, bucket: string): boolean {
    const host = (ip || "").replace(/^::ffff:/, "");
    if (!host || host === "127.0.0.1" || host === "::1" || host === "localhost") return true;
    const key = bucket + "|" + (ip || "unknown") + "|" + (churchId || "");
    const now = Date.now();
    const times = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (times.length >= this.maxHits) {
      this.hits.set(key, times);
      return false;
    }
    times.push(now);
    this.hits.set(key, times);
    return true;
  }

  static reset() {
    this.hits.clear();
  }
}
