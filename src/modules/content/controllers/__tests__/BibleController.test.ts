import "reflect-metadata";
import express from "express";
jest.mock("../ContentBaseController", () => ({ ContentBaseController: class { json(obj: unknown, status: number) { return { obj, status }; } } }));
jest.mock("../../helpers/BibleSourceFactory", () => ({ BibleSourceFactory: { getVerses: jest.fn() } }));
jest.mock("../../helpers/index", () => ({ Permissions: { server: { admin: "serverAdmin" } } }));
jest.mock("../../repositories/BibleVerseTextRepo", () => ({ BibleVerseTextRepo: { coversRange: jest.fn() } }));

import { BibleController } from "../BibleController.js";
import { BibleSourceFactory } from "../../helpers/BibleSourceFactory.js";

describe("BibleController key validation", () => {
  it("accepts real translation, chapter and verse keys", () => {
    for (const k of ["de4e12af7f28f599-02", "YOUVERSION-111", "JHN.3", "JHN.intro", "JHN.3.16", "1CO"]) expect(BibleController.isSafeKey(k)).toBe(true);
  });

  it("rejects keys that could rewrite the upstream URL", () => {
    for (const k of ["../admin", "x?y=1", "a/b", "a#b", "", "JHN..3"]) expect(BibleController.isSafeKey(k)).toBe(false);
  });

  it("returns 400 before calling upstream on a bad key", async () => {
    const controller = new BibleController();
    Object.assign(controller, {
      actionWrapperAnon: (_req: express.Request, _res: express.Response, action: () => unknown) => action(),
      json: (obj: unknown, status: number) => ({ obj, status })
    });
    const result = (await controller.getVerses("ENG", "JHN.3?x=1", {} as express.Request, {} as express.Response)) as { obj: unknown; status: number };
    expect(result.status).toBe(400);
    expect(BibleSourceFactory.getVerses).not.toHaveBeenCalled();
  });
});
