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
import type express from "express";
import { TextingController } from "../TextingController.js";
import { RepoManager } from "../../../../shared/infrastructure/RepoManager.js";

type SendBody = { groupId?: string; personIds?: string[]; message: string };
type Saved = { id?: string; groupId?: string; personId?: string };
type StatusResult = { status?: number };
const res = {} as express.Response;
const sendReq = (body: SendBody) => ({ body }) as express.Request<{}, {}, SendBody>;
const previewReq = (body: { personIds?: string[] }) => ({ body }) as express.Request<{}, {}, { personIds?: string[] }>;

const people = [
  { id: "p1", firstName: "Donald", lastName: "Clark", displayName: "Donald Clark", mobilePhone: "+15550001" },
  { id: "p2", firstName: "Carol", lastName: "Clark", displayName: "Carol Clark", mobilePhone: "+1 555-0001" },
  { id: "p3", firstName: "Ann", lastName: "Lee", displayName: "Ann Lee", mobilePhone: "+15550003", smsOptedOut: 1 },
  { id: "p4", firstName: "Bob", lastName: "Ray", displayName: "Bob Ray", mobilePhone: "" }
];

function makeController(granted = true) {
  const loadByIds = jest.fn(async () => people);
  const repos = {
    sentText: { save: jest.fn(async (m: Saved) => ({ ...m, id: "st1" })) },
    deliveryLog: { save: jest.fn(async (m: Saved) => m) }
  };
  (RepoManager.getRepos as jest.Mock).mockResolvedValue({ person: { loadByIds } });
  const controller = new TextingController();
  const au = { churchId: "c1", personId: "sender", jwt: "jwt", checkAccess: () => granted };
  Object.assign(controller, { repos, actionWrapper: (_req: express.Request, _res: express.Response, action: (user: typeof au) => unknown) => action(au) });
  return { controller, repos, loadByIds };
}

beforeEach(() => {
  provider.sendBulk.mockReset();
  provider.sendMessage.mockReset();
  (axios.get as jest.Mock).mockReset();
});

describe("TextingController people sends", () => {
  it("previews the selected people without calling the group endpoint", async () => {
    const { controller } = makeController();
    const result = await controller.previewPeople(previewReq({ personIds: ["p1", "p2", "p3", "p4"] }), res);
    expect(result).toEqual({ totalMembers: 4, eligibleCount: 1, optedOutCount: 1, noPhoneCount: 1 });
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("texts the selected people, skipping opted-out, missing and repeated numbers", async () => {
    const { controller, repos, loadByIds } = makeController();
    provider.sendBulk.mockResolvedValue([{ success: true }]);
    const result = await controller.sendToGroup(sendReq({ personIds: ["p1", "p2", "p3", "p4", "p1"], message: "Practice is at 7" }), res);
    expect(loadByIds).toHaveBeenCalledWith("c1", ["p1", "p2", "p3", "p4"]);
    expect(provider.sendBulk.mock.calls[0][1]).toEqual(["+15550001"]);
    expect(result).toEqual({ totalMembers: 4, recipientCount: 1, successCount: 1, failCount: 0, optedOutCount: 1, noPhoneCount: 1 });
    expect(repos.sentText.save.mock.calls[0][0].groupId).toBeUndefined();
    expect(repos.deliveryLog.save.mock.calls.map((c) => c[0].personId)).toEqual(["p1", "p3"]);
  });

  it("requires a group or people", async () => {
    const { controller } = makeController();
    const result = (await controller.sendToGroup(sendReq({ personIds: [], message: "Hi" }), res)) as StatusResult;
    expect(result.status).toBe(400);
  });

  it("refuses people without texting permission", async () => {
    const { controller } = makeController(false);
    expect(((await controller.previewPeople(previewReq({ personIds: ["p1"] }), res)) as StatusResult).status).toBe(401);
    expect(((await controller.sendToGroup(sendReq({ personIds: ["p1"], message: "Hi" }), res)) as StatusResult).status).toBe(401);
  });
});
