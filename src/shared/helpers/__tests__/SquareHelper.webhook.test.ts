import crypto from "crypto";
import { SquareHelper } from "../SquareHelper.js";

function sign(url: string, body: string, key: string, alg: "sha256" | "sha1") {
  return crypto.createHmac(alg, key).update(url + body).digest("base64");
}

describe("SquareHelper.validateWebhookSignature", () => {
  const url = "https://api.example.com/giving/donate/webhook/square?churchId=c1";
  const body = '{"type":"payment.updated"}';
  const key = "whsec_test_key";

  it("accepts a valid HMAC-SHA256 signature", () => {
    expect(SquareHelper.validateWebhookSignature(body, sign(url, body, key, "sha256"), url, key)).toBe(true);
  });

  it("accepts a valid HMAC-SHA1 signature", () => {
    expect(SquareHelper.validateWebhookSignature(body, sign(url, body, key, "sha1"), url, key)).toBe(true);
  });

  it("rejects an empty signature, key, url, or body", () => {
    const sig = sign(url, body, key, "sha256");
    expect(SquareHelper.validateWebhookSignature(body, "", url, key)).toBe(false);
    expect(SquareHelper.validateWebhookSignature(body, sig, url, "")).toBe(false);
    expect(SquareHelper.validateWebhookSignature(body, sig, "", key)).toBe(false);
    expect(SquareHelper.validateWebhookSignature("", sig, url, key)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const sig = sign(url, body, key, "sha256");
    expect(SquareHelper.validateWebhookSignature(body + "x", sig, url, key)).toBe(false);
  });
});
