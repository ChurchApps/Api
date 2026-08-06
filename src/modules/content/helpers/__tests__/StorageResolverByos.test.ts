jest.mock("../../../../shared/helpers/Environment.js", () => ({ Environment: { ministryStuffContentRoot: "https://ms.example.com", contentRoot: "https://content.churchapps.org" } }));
jest.mock("@churchapps/apihelper", () => {
  const providers = new Map<string, unknown>();
  return {
    EncryptionHelper: { encrypt: (v: string) => "enc:" + v, decrypt: (v: string) => String(v).replace(/^enc:/, "") },
    StorageProviderFactory: {
      register: (name: string, provider: unknown) => providers.set(name, provider),
      isAvailable: (name: string) => providers.has(name?.toLowerCase()),
      getProvider: (name: string) => providers.get(name?.toLowerCase()),
      getDefault: () => ({ name: "churchapps" })
    }
  };
});

import { StorageResolver } from "../StorageResolver.js";
import { DropboxStorageProvider } from "../DropboxStorageProvider.js";

const makeRepo = (rows: any[]) => ({
  loadByChurchId: jest.fn().mockResolvedValue(rows),
  convertAllToModel: jest.fn((r: any[]) => r),
  save: jest.fn(async (m: any) => m)
});

describe("StorageResolver BYOS routing", () => {
  it("constructs a per-church provider for an enabled BYOS row", async () => {
    const repo = makeRepo([{ id: "r1", churchId: "ch1", provider: "dropbox", enabled: true, accessToken: "enc:t" }]);
    const storage = await StorageResolver.forChurch(repo as any, "ch1");
    expect(storage.name).toBe("dropbox");
    expect(storage.provider).toBeInstanceOf(DropboxStorageProvider);
  });

  it("falls back to churchapps when no row is enabled", async () => {
    const repo = makeRepo([{ id: "r1", churchId: "ch1", provider: "dropbox", enabled: false }]);
    const storage = await StorageResolver.forChurch(repo as any, "ch1");
    expect(storage.name).toBe("churchapps");
  });

  it("routes files to the provider named on the row, even when disabled", async () => {
    const repo = makeRepo([{ id: "r1", churchId: "ch1", provider: "dropbox", enabled: false, accessToken: "enc:t" }]);
    const storage = await StorageResolver.forFile(repo as any, { churchId: "ch1", provider: "dropbox", externalId: "/ch1/files/a.pdf" } as any);
    expect(storage.name).toBe("dropbox");
  });

  it("returns null when the file's provider row was deleted", async () => {
    const repo = makeRepo([]);
    const storage = await StorageResolver.forFile(repo as any, { churchId: "ch1", provider: "dropbox", externalId: "x" } as any);
    expect(storage).toBeNull();
  });

  it("derives legacy files from their url", async () => {
    const repo = makeRepo([]);
    const storage = await StorageResolver.forFile(repo as any, { churchId: "ch1", contentPath: "https://content.churchapps.org/ch1/files/a.pdf?dt=1" } as any);
    expect(storage.name).toBe("churchapps");
    const ms = await StorageResolver.forFile(repo as any, { churchId: "ch1", contentPath: "https://ms.example.com/ch1/files/a.pdf" } as any);
    expect(ms.name).toBe("ministrystuff");
  });
});
