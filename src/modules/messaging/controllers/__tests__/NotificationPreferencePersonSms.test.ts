import "reflect-metadata";

// Staff with Texting Send can turn Text reminders on or off for one person (issue #1600).
const createNotificationPrefMock = jest.fn(async (churchId: string, personId: string) => ({ id: "NEW", churchId, personId, allowPush: true, emailFrequency: "daily" }));
jest.mock("../../../../shared/infrastructure/index", () => ({ BaseController: class { constructor(_module?: string) {} } }));
jest.mock("../../repositories/index", () => ({ Repos: class {} }));
jest.mock("../../../../shared/helpers/Permissions", () => ({ Permissions: { texting: { send: "textingSend" } } }));
jest.mock("../../helpers/NotificationHelper.js", () => ({ NotificationHelper: { createNotificationPref: createNotificationPrefMock } }));
jest.mock("../../helpers/NotificationCategoryHelper.js", () => ({ NotificationCategoryHelper: { all: (): unknown[] => [] } }));

import express from "express";
import { NotificationPreferenceController } from "../NotificationPreferenceController.js";
import { NotificationPreference } from "../../models/index.js";

type JsonResult = { obj?: unknown; status?: number };

const principal = (access: string[]) => ({ id: "u1", churchId: "c1", personId: "staff1", checkAccess: (perm: string) => access.includes(perm) });

function makeController(access: string[], existing?: NotificationPreference) {
  const notificationPreference = {
    loadByPersonId: jest.fn(async () => existing),
    save: jest.fn(async (p: NotificationPreference) => p)
  };
  const controller = new NotificationPreferenceController();
  Object.assign(controller, {
    repos: { notificationPreference },
    actionWrapper: (_req: express.Request, _res: express.Response, action: (a: ReturnType<typeof principal>) => unknown) => action(principal(access)),
    json: (obj: unknown, status: number) => ({ obj, status })
  });
  return { controller, notificationPreference };
}

const getReq = { params: { personId: "P9" } } as express.Request<{ personId: string }>;
const postReq = (allowSms: boolean) => ({ params: { personId: "P9" }, body: { allowSms } }) as express.Request<{ personId: string }, {}, { allowSms: boolean }>;
const res = {} as express.Response;

beforeEach(() => createNotificationPrefMock.mockClear());

describe("NotificationPreferenceController person sms", () => {
  it("refuses GET and POST without texting.send", async () => {
    const { controller, notificationPreference } = makeController([]);
    expect(((await controller.loadPersonSms(getReq, res)) as JsonResult).status).toBe(401);
    expect(((await controller.savePersonSms(postReq(true), res)) as JsonResult).status).toBe(401);
    expect(notificationPreference.loadByPersonId).not.toHaveBeenCalled();
    expect(notificationPreference.save).not.toHaveBeenCalled();
  });

  it("reads Off without creating a row when the person has none", async () => {
    const { controller, notificationPreference } = makeController(["textingSend"]);
    expect(await controller.loadPersonSms(getReq, res)).toEqual({ allowSms: false });
    expect(notificationPreference.loadByPersonId).toHaveBeenCalledWith("c1", "P9");
    expect(createNotificationPrefMock).not.toHaveBeenCalled();
  });

  it("reads On from an existing row", async () => {
    const { controller } = makeController(["textingSend"], { id: "R1", churchId: "c1", personId: "P9", allowSms: true });
    expect(await controller.loadPersonSms(getReq, res)).toEqual({ allowSms: true });
  });

  it("creates the row when missing and saves only allowSms", async () => {
    const { controller, notificationPreference } = makeController(["textingSend"]);
    expect(await controller.savePersonSms(postReq(true), res)).toEqual({ allowSms: true });
    expect(createNotificationPrefMock).toHaveBeenCalledWith("c1", "P9");
    expect(notificationPreference.save).toHaveBeenCalledWith({ id: "NEW", churchId: "c1", personId: "P9", allowPush: true, emailFrequency: "daily", allowSms: true });
  });

  it("leaves the person's other settings alone on an existing row", async () => {
    const existing = { id: "R1", churchId: "c1", personId: "P9", allowPush: false, emailFrequency: "never", allowSms: true };
    const { controller, notificationPreference } = makeController(["textingSend"], existing);
    expect(await controller.savePersonSms(postReq(false), res)).toEqual({ allowSms: false });
    expect(createNotificationPrefMock).not.toHaveBeenCalled();
    expect(notificationPreference.save).toHaveBeenCalledWith({ id: "R1", churchId: "c1", personId: "P9", allowPush: false, emailFrequency: "never", allowSms: false });
  });
});
