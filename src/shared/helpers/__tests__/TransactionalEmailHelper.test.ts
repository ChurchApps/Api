const sendTemplatedEmailMock = jest.fn().mockResolvedValue(undefined);
jest.mock("@churchapps/apihelper", () => ({ EmailHelper: { sendTemplatedEmail: sendTemplatedEmailMock } }));

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
