import crypto from "crypto";
import { WebhookSigner } from "../WebhookSigner";

describe("WebhookSigner", () => {
  it("keeps the v1 signature over the raw body", () => {
    expect(WebhookSigner.sign("s", "{}")).toBe("sha256=" + crypto.createHmac("sha256", "s").update("{}").digest("hex"));
  });

  it("binds the timestamp into the v2 signature", () => {
    const v2 = WebhookSigner.signV2("s", "1700000000", "{}");
    expect(v2).toBe("sha256=" + crypto.createHmac("sha256", "s").update("1700000000.{}").digest("hex"));
    expect(WebhookSigner.signV2("s", "1700000001", "{}")).not.toBe(v2);
  });
});
