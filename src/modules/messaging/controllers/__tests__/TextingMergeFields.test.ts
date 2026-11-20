import "reflect-metadata";
jest.mock("../MessagingBaseController", () => ({ MessagingBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { texting: { send: "textingSend" } } }));
jest.mock("../../../../shared/helpers/Environment", () => ({ Environment: { membershipApi: "http://membership" } }));
jest.mock("../../../../shared/infrastructure/RepoManager", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../helpers/TextingConfigHelper", () => ({ TextingConfigHelper: { load: jest.fn(async () => ({ providerName: "clearstream" })) } }));
jest.mock("@churchapps/apihelper", () => ({ EncryptionHelper: { encrypt: (x: string) => x, decrypt: (x: string) => x } }));
jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn() } }));

const provider = { sendBulk: jest.fn(), sendMessage: jest.fn(), addSubscriber: jest.fn(), capabilities: {} };
jest.mock("@churchapps/texting", () => ({ getProvider: () => provider }));

import axios from "axios";
import express from "express";
import { TextingController } from "../TextingController.js";
import { DeliveryLog, SentText } from "../../models/index.js";

type GroupReq = express.Request<{}, {}, { groupId: string; message: string }>;
type PersonReq = express.Request<{}, {}, { personId: string; phoneNumber: string; message: string; personName?: string }>;
import { RepoManager } from "../../../../shared/infrastructure/RepoManager.js";

function makeController() {
  const repos = {
    sentText: { save: jest.fn(async (m: SentText) => ({ ...m, id: "st1" })) },
    deliveryLog: { save: jest.fn(async (m: DeliveryLog) => m) }
  };
  (RepoManager.getRepos as jest.Mock).mockResolvedValue({
    church: { load: jest.fn(async () => ({ id: "c1", name: "Grace Community" })) },
    person: { loadByIds: jest.fn(async () => [{ id: "p1", firstName: "Donald", lastName: "Clark", displayName: "Donald Clark", mobilePhone: "+15550001" }]) }
  });
  const controller = new TextingController();
  const au = { churchId: "c1", personId: "sender", jwt: "jwt", checkAccess: () => true };
  Object.assign(controller, {
    repos,
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: typeof au) => unknown) => action(au)
  });
  return { controller, repos };
}

function groupMember(personId: string, first: string, last: string, phone: string) {
  return { personId, person: { name: { first, last, display: first + " " + last }, contactInfo: { mobilePhone: phone } } };
}

beforeEach(() => {
  provider.sendBulk.mockReset();
  provider.sendMessage.mockReset();
  (axios.get as jest.Mock).mockReset();
});

describe("TextingController merge fields", () => {
  it("resolves placeholders for the person being texted", async () => {
    const { controller, repos } = makeController();
    provider.sendMessage.mockResolvedValue({ success: true });
    await controller.sendToPerson({ body: { personId: "p1", message: "Hi {{firstName}} {{lastName}}, from {{churchName}}" } } as PersonReq, {} as express.Response);
    expect(provider.sendMessage).toHaveBeenCalledWith(expect.anything(), "+15550001", "Hi Donald Clark, from Grace Community");
    expect(repos.sentText.save.mock.calls[0][0].message).toBe("Hi Donald Clark, from Grace Community");
  });

  it("sends each group member their own resolved text when the message has placeholders", async () => {
    const { controller, repos } = makeController();
    (axios.get as jest.Mock).mockResolvedValue({ data: [groupMember("p1", "Donald", "Clark", "+15550001"), groupMember("p2", "Carol", "Clark", "+15550002")] });
    provider.sendMessage.mockResolvedValue({ success: true });
    const result = (await controller.sendToGroup({ body: { groupId: "g1", message: "Hi {{firstName}}" } } as GroupReq, {} as express.Response)) as { successCount: number };
    expect(provider.sendBulk).not.toHaveBeenCalled();
    expect(provider.sendMessage).toHaveBeenCalledWith(expect.anything(), "+15550001", "Hi Donald");
    expect(provider.sendMessage).toHaveBeenCalledWith(expect.anything(), "+15550002", "Hi Carol");
    expect(result.successCount).toBe(2);
    expect(repos.sentText.save.mock.calls[0][0].message).toBe("Hi {{firstName}}");
  });

  it("keeps a single bulk send when the group message has no placeholders", async () => {
    const { controller } = makeController();
    (axios.get as jest.Mock).mockResolvedValue({ data: [groupMember("p1", "Donald", "Clark", "+15550001"), groupMember("p2", "Carol", "Clark", "+15550002")] });
    provider.sendBulk.mockResolvedValue([{ success: true }, { success: true }]);
    await controller.sendToGroup({ body: { groupId: "g1", message: "Practice is at 7" } } as GroupReq, {} as express.Response);
    expect(provider.sendBulk).toHaveBeenCalledTimes(1);
    expect(provider.sendBulk.mock.calls[0][1]).toEqual(["+15550001", "+15550002"]);
    expect(provider.sendMessage).not.toHaveBeenCalled();
  });
});
