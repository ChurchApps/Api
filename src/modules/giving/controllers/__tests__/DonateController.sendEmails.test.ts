import "reflect-metadata";

const sendTransactionalMock = jest.fn().mockResolvedValue(undefined);
jest.mock("../GivingBaseController", () => ({ GivingBaseController: class {} }));
jest.mock("../../../../shared/helpers/Permissions.js", () => ({ Permissions: { donations: { edit: "donationsEdit" } } }));
jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { supportEmail: "support@b1.church", appEnv: "prod" } }));
jest.mock("../../../../shared/helpers/TransactionalEmailHelper.js", () => ({ TransactionalEmailHelper: { sendTransactional: sendTransactionalMock } }));
jest.mock("../../models/index.js", () => ({}));
jest.mock("@churchapps/apihelper", () => ({ CurrencyHelper: { formatCurrencyWithLocale: (amount: number) => "$" + amount } }));
jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock("../../../../shared/helpers/GatewayService.js", () => ({ GatewayService: {} }));

import { DonateController } from "../DonateController.js";

describe("DonateController donation confirmation email", () => {
  beforeEach(() => sendTransactionalMock.mockClear());

  it("passes the church logo as a URL instead of embedding <img> HTML in the app name", async () => {
    const controller = new DonateController();
    const church = { name: "Grace Church", subDomain: "grace", churchURL: "https://grace.b1.church", logo: "https://content.churchapps.org/logo.png" };
    await (controller as any).sendEmails("donor@x.com", church, [{ name: "General", amount: 25 }], 25, undefined, undefined, "one-time", "USD");

    expect(sendTransactionalMock).toHaveBeenCalledTimes(1);
    const args = sendTransactionalMock.mock.calls[0];
    expect(args[2]).toBe("Grace Church");
    expect(args[8]).toBe("https://content.churchapps.org/logo.png");
  });

  it("escapes fund names and hides a fee row that is only rounding noise", async () => {
    const controller = new DonateController();
    await (controller as any).sendEmails("donor@x.com", { name: "Grace Church", subDomain: "grace" }, [{ name: "<a href=x>Win</a>", amount: 0.1 }, { name: "B", amount: 0.2 }], 0.3, undefined, undefined, "one-time", "USD");
    const contents: string = sendTransactionalMock.mock.calls[0][5];
    expect(contents).toContain("&lt;a href=x&gt;Win&lt;/a&gt;");
    expect(contents).not.toContain("<a href=x>");
    expect(contents).not.toContain("Transaction Fee");
  });

  it("sends no logo when the church has none", async () => {
    const controller = new DonateController();
    await (controller as any).sendEmails("donor@x.com", { name: "Grace Church", subDomain: "grace" }, [{ name: "General", amount: 25 }], 25, undefined, undefined, "one-time", "USD");
    const args = sendTransactionalMock.mock.calls[0];
    expect(args[2]).toBe("Grace Church");
    expect(args[8]).toBeUndefined();
  });
});
