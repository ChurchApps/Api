import crypto from "crypto";

// HMAC-SHA256 signing for outbound webhook payloads. Consumers recompute the
// signature over the raw request body and compare against the X-B1-Signature header.
export class WebhookSigner {
  public static sign(secret: string, body: string): string {
    return "sha256=" + crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
  }

  // V2 binds the timestamp so a captured delivery can't be replayed outside the receiver's freshness window.
  public static signV2(secret: string, timestamp: string, body: string): string {
    return WebhookSigner.sign(secret, timestamp + "." + body);
  }

  public static generateSecret(): string {
    return crypto.randomBytes(24).toString("hex");
  }
}
