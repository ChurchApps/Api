/** A OneDrive link lookup that never answers falls back to the bearer url instead of holding the manifest build past the Lambda timeout. */

jest.mock("@churchapps/content-providers", () => ({
  setProviderSecret: () => undefined,
  getProviderConfig: () => null,
  getProvider: () => null
}));
jest.mock("../../../../shared/modules/index.js", () => ({ getMembershipModuleGateway: () => ({ loadChurch: async () => null, loadGroup: async () => null }) }));

import { ScreenManifestHelper } from "../ScreenManifestHelper.js";

const fileUrl = "https://graph.microsoft.com/v1.0/me/drive/items/FILE1/content";

function ctx(): any {
  const auth = new Map<string, Promise<any>>([["onedrive|", Promise.resolve({ access_token: "tok" })]]);
  return { repos: {}, churchId: "CHU1", files: new Map(), instructions: new Map(), folderTitles: new Map(), auth, timings: new Map(), counts: { entries: 0, occurrences: 0, items: 0 } };
}

const directDownload = (c: any) => (ScreenManifestHelper as any).directDownload(c, "onedrive", "FILE1", null);

describe("ScreenManifestHelper OneDrive link lookup", () => {
  const realFetch = global.fetch;
  const linkTimeout = ScreenManifestHelper.linkTimeoutMs;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => { errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined); });
  afterEach(() => {
    global.fetch = realFetch;
    ScreenManifestHelper.linkTimeoutMs = linkTimeout;
    errorSpy.mockRestore();
  });

  it("still returns the pre-signed link when OneDrive answers with a redirect", async () => {
    global.fetch = jest.fn(async () => ({ headers: new Headers({ location: "https://signed.example.com/f" }) })) as any;
    await expect(directDownload(ctx())).resolves.toEqual({ url: "https://signed.example.com/f" });
  });

  it("gives up on a hung lookup and falls back to the bearer url", async () => {
    ScreenManifestHelper.linkTimeoutMs = 50;
    // Hangs until aborted, like the calls SLOW_MANIFEST_PENDING showed waiting at 20 s.
    global.fetch = jest.fn((_url: string, init: any) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal.reason));
    })) as any;

    const guard = new Promise((resolve) => setTimeout(() => resolve("still waiting"), 1000));
    const result = await Promise.race([directDownload(ctx()), guard]);

    expect(result).toEqual({ url: fileUrl, headers: { Authorization: "Bearer tok" } });
    expect((global.fetch as jest.Mock).mock.calls[0][1].signal).toBeDefined();
  });
});
