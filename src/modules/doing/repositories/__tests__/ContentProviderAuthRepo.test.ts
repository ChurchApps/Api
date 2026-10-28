import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
// Mirrors apihelper's EncryptionHelper (AES-256-CTR, "base64(iv)|base64(ciphertext)", "" when not a pair).
jest.mock("@churchapps/apihelper", () => {
  const crypto = jest.requireActual("crypto");
  const key = "0123456789abcdef0123456789abcdef";
  return {
    UniqueIdHelper: { shortId: () => "gen_id" },
    EncryptionHelper: {
      encrypt: (plain: string) => {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv("aes-256-ctr", key, iv);
        return iv.toString("base64") + "|" + Buffer.concat([cipher.update(plain), cipher.final()]).toString("base64");
      },
      decrypt: (pair: string) => {
        const parts = pair.split("|");
        if (parts.length !== 2) return "";
        const decipher = crypto.createDecipheriv("aes-256-ctr", key, Buffer.from(parts[0], "base64"));
        return Buffer.concat([decipher.update(Buffer.from(parts[1], "base64")), decipher.final()]).toString();
      }
    }
  };
});

import { EncryptionHelper } from "@churchapps/apihelper";
import { getDb } from "../../db/index.js";
import { ContentProviderAuthRepo } from "../ContentProviderAuthRepo.js";

// Records calls on a Kysely chain and returns the given rows from execute/executeTakeFirst.
function recordingDb(rows: any[] = []) {
  const calls: { method: string; args: any[] }[] = [];
  const proxy: any = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "execute") return async () => rows;
      if (prop === "executeTakeFirst") return async () => rows[0];
      return (...args: any[]) => { calls.push({ method: prop as string, args }); return proxy; };
    }
  });
  return { proxy, calls };
}

const baseModel = () => ({ churchId: "c1", ministryId: "m1", providerId: "dropbox", accessToken: "sl.access-token", refreshToken: "refresh-token", tokenType: "Bearer", scope: "files.content.read" });

// Issue #1400: content provider tokens were stored as plain text.
describe("ContentProviderAuthRepo token encryption", () => {
  afterEach(() => jest.restoreAllMocks());

  it("encrypts both tokens on create and leaves the caller's model in plain text", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    const model: any = baseModel();
    const saved = await new ContentProviderAuthRepo().save(model);

    const values = calls.find((c) => c.method === "values")!.args[0];
    expect(values.accessToken).not.toBe("sl.access-token");
    expect(values.accessToken).toContain("|");
    expect(values.refreshToken).not.toBe("refresh-token");
    expect(EncryptionHelper.decrypt(values.accessToken)).toBe("sl.access-token");
    expect(EncryptionHelper.decrypt(values.refreshToken)).toBe("refresh-token");
    expect(saved.accessToken).toBe("sl.access-token");
    expect(model.refreshToken).toBe("refresh-token");
  });

  it("encrypts both tokens on update", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    const model: any = { ...baseModel(), id: "a1" };
    await new ContentProviderAuthRepo().save(model);

    const set = calls.find((c) => c.method === "set")!.args[0];
    expect(EncryptionHelper.decrypt(set.accessToken)).toBe("sl.access-token");
    expect(EncryptionHelper.decrypt(set.refreshToken)).toBe("refresh-token");
    expect(model.accessToken).toBe("sl.access-token");
  });

  it("keeps an empty refresh token empty", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new ContentProviderAuthRepo().save({ ...baseModel(), refreshToken: "" } as any);
    expect(calls.find((c) => c.method === "values")!.args[0].refreshToken).toBe("");
  });

  it("decrypts tokens on load", async () => {
    const row = { id: "a1", churchId: "c1", providerId: "dropbox", accessToken: EncryptionHelper.encrypt("sl.access-token"), refreshToken: EncryptionHelper.encrypt("refresh-token") };
    (getDb as jest.Mock).mockReturnValue(recordingDb([row]).proxy);
    const repo = new ContentProviderAuthRepo();

    const one: any = await repo.load("c1", "a1");
    expect(one.accessToken).toBe("sl.access-token");
    expect(one.refreshToken).toBe("refresh-token");

    const byProvider: any = await repo.loadChurchLevelByProvider("c1", "dropbox");
    expect(byProvider.accessToken).toBe("sl.access-token");

    const all: any[] = await repo.loadByMinistry("c1", "m1");
    expect(all[0].accessToken).toBe("sl.access-token");
    expect(repo.convertAllToModel("c1", all)[0].refreshToken).toBe("refresh-token");
  });

  it("returns legacy plain-text tokens unchanged", async () => {
    const row = { id: "a1", churchId: "c1", providerId: "gdrive", accessToken: "ya29.legacy", refreshToken: "1//legacy", expiresAt: new Date("2026-10-27T12:00:00Z") };
    (getDb as jest.Mock).mockReturnValue(recordingDb([row]).proxy);
    const loaded: any = await new ContentProviderAuthRepo().loadByMinistryAndProvider("c1", "m1", "gdrive");
    expect(loaded.accessToken).toBe("ya29.legacy");
    expect(loaded.refreshToken).toBe("1//legacy");
    expect(loaded.expiresAt).toEqual(new Date("2026-10-27T12:00:00Z"));
  });

  it("returns null when nothing is found", async () => {
    (getDb as jest.Mock).mockReturnValue(recordingDb([]).proxy);
    expect(await new ContentProviderAuthRepo().load("c1", "missing")).toBeNull();
  });
});
