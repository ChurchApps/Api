const sendTemplatedEmailMock = jest.fn().mockResolvedValue(undefined);
jest.mock("@churchapps/apihelper", () => ({ EmailHelper: { sendTemplatedEmail: sendTemplatedEmailMock } }));
jest.mock("../Environment.js", () => ({ Environment: { supportEmail: "support@churchapps.org" } }));

import { TransactionalEmailHelper } from "../TransactionalEmailHelper.js";

describe("TransactionalEmailHelper.sendTransactional", () => {
  beforeEach(() => {
    sendTemplatedEmailMock.mockClear();
  });

  it("passes through to EmailHelper.sendTemplatedEmail with the same argument shape", async () => {
    await TransactionalEmailHelper.sendTransactional("from@x.com", "to@x.com", "B1", "https://b1.church", "Subject", "<p>Body</p>", "ChurchEmailTemplate.html", "reply@x.com");
    expect(sendTemplatedEmailMock).toHaveBeenCalledWith("from@x.com", "to@x.com", "B1", "https://b1.church", "Subject", "<p>Body</p>", "ChurchEmailTemplate.html", "reply@x.com", undefined);
  });

  it("passes an optional logo URL through", async () => {
    await TransactionalEmailHelper.sendTransactional("from@x.com", "to@x.com", "Grace", "https://grace.b1.church", "Subject", "<p>Body</p>", "ChurchEmailTemplate.html", undefined, "https://x.com/logo.png");
    expect(sendTemplatedEmailMock).toHaveBeenCalledWith("from@x.com", "to@x.com", "Grace", "https://grace.b1.church", "Subject", "<p>Body</p>", "ChurchEmailTemplate.html", undefined, "https://x.com/logo.png");
  });

  it("passes template/replyTo through as undefined when omitted", async () => {
    await TransactionalEmailHelper.sendTransactional("from@x.com", "to@x.com", "B1", "https://b1.church", "Subject", "<p>Body</p>");
    expect(sendTemplatedEmailMock).toHaveBeenCalledWith("from@x.com", "to@x.com", "B1", "https://b1.church", "Subject", "<p>Body</p>", undefined, undefined, undefined);
  });
});

describe("TransactionalEmailHelper.fromAddress", () => {
  it("puts the church name in front of the support address", () => {
    expect(TransactionalEmailHelper.fromAddress("Grace Church")).toBe('"Grace Church" <support@churchapps.org>');
  });

  it("strips quotes, backslashes and line breaks so the name cannot break the header", () => {
    expect(TransactionalEmailHelper.fromAddress('  The "Grace"\\ Church\r\nBcc: x@evil.test ')).toBe('"The Grace Church Bcc: x@evil.test" <support@churchapps.org>');
  });

  it("encodes non-ASCII names as RFC 2047 UTF-8", () => {
    const from = TransactionalEmailHelper.fromAddress("Iglesia Niño");
    const match = from.match(/^"=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=" <support@churchapps\.org>$/);
    expect(match).not.toBeNull();
    expect(Buffer.from(match![1], "base64").toString("utf8")).toBe("Iglesia Niño");
  });

  it("caps long names at 64 characters", () => {
    const from = TransactionalEmailHelper.fromAddress("A".repeat(100));
    expect(from).toBe(`"${"A".repeat(64)}" <support@churchapps.org>`);
  });

  it("returns the bare address when there is no usable name", () => {
    expect(TransactionalEmailHelper.fromAddress()).toBe("support@churchapps.org");
    expect(TransactionalEmailHelper.fromAddress(null)).toBe("support@churchapps.org");
    expect(TransactionalEmailHelper.fromAddress("  \r\n\"\" ")).toBe("support@churchapps.org");
  });

  it("uses an explicit address when given", () => {
    expect(TransactionalEmailHelper.fromAddress("Grace Church", "noreply@example.org")).toBe('"Grace Church" <noreply@example.org>');
  });
});
