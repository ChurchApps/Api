jest.mock("../../../../shared/infrastructure/index.js", () => ({ BaseController: class {} }));
jest.mock("../../../../shared/helpers/ExchangeRateHelper.js", () => ({ ExchangeRateHelper: {} }));
jest.mock("../../repositories/index.js", () => ({}));

import { GivingBaseController } from "../GivingBaseController.js";

describe("GivingBaseController.toPublicGateway", () => {
  it("drops keys and every setting except the sandbox flag", () => {
    const settings = JSON.stringify({ sandbox: true, secret: "x" });
    const pub = GivingBaseController.toPublicGateway({ id: "G1", provider: "stripe", publicKey: "pk", privateKey: "sk", webhookKey: "wh", currency: "usd", settings });
    expect(pub).toEqual(expect.objectContaining({ id: "G1", provider: "stripe", publicKey: "pk", currency: "usd", settings: { sandbox: true } }));
    expect(pub.privateKey).toBeUndefined();
    expect(pub.webhookKey).toBeUndefined();
  });
});
