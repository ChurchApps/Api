import crypto from "crypto";

// HMAC-SHA256 signing for outbound webhook payloads. Consumers recompute the
// signature over the raw request body and compare against the X-B1-Signature header.
export class WebhookSigner {
  public static sign(secret: string, body: string): string {
    return "sha256=" + crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
  }

  public static generateSecret(): string {
    return crypto.randomBytes(24).toString("hex");
  }
}
