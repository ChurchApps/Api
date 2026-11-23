jest.mock("axios", () => ({ post: jest.fn(), get: jest.fn(), delete: jest.fn(), put: jest.fn(), patch: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({
  EncryptionHelper: {
    encrypt: (v: string) => "enc:" + v,
    decrypt: (v: string) => String(v).replace(/^enc:/, "")
  }
}));
jest.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: jest.fn().mockResolvedValue("https://bucket.example.com/presigned-put") }));

import axios from "axios";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ByosAuth } from "../ByosAuth.js";
import { GoogleDriveStorageProvider } from "../GoogleDriveStorageProvider.js";
import { DropboxStorageProvider } from "../DropboxStorageProvider.js";
import { OneDriveStorageProvider } from "../OneDriveStorageProvider.js";
import { S3CompatibleStorageProvider } from "../S3CompatibleStorageProvider.js";
import { StorageProvider } from "../../models/index.js";
import type { StorageProviderRepo } from "../../repositories/StorageProviderRepo.js";

const mockedAxios = axios as jest.Mocked<typeof axios>;

const futureDate = () => new Date(Date.now() + 60 * 60 * 1000);
const pastDate = () => new Date(Date.now() - 60 * 60 * 1000);

const makeRepo = (rows: StorageProvider[] = []) => ({
  loadByChurchId: jest.fn().mockResolvedValue(rows),
  convertAllToModel: jest.fn((r: StorageProvider[]) => r),
  save: jest.fn(async (m: StorageProvider) => m)
});

// The providers only call loadByChurchId / convertAllToModel / save on the repo.
const asRepo = (repo: Partial<StorageProviderRepo>) => repo as StorageProviderRepo;

const connectedRow = (provider: string, extra: Partial<StorageProvider> = {}): StorageProvider => ({
  id: "row1",
  churchId: "ch1",
  provider,
  enabled: true,
  accessToken: "enc:tok",
  refreshToken: "enc:refresh",
  tokenExpiresAt: futureDate(),
  ...extra
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GoogleDriveStorageProvider", () => {
  it("initiates a resumable session and returns a raw-body PUT presign with externalIdField", async () => {
    const row = connectedRow("googledrive", { settings: JSON.stringify({ folderId: "fld1" }) });
    mockedAxios.post.mockResolvedValue({ headers: { location: "https://upload.session/xyz" }, data: {} });
    const provider = new GoogleDriveStorageProvider(row, asRepo(makeRepo([row])));
    const result = await provider.getUploadUrl("/ch1/files/video.mp4", "video/mp4", 1234);
    expect(result).toEqual({ url: "https://upload.session/xyz", fields: {}, key: "/ch1/files/video.mp4", method: "PUT", rawBody: true, externalIdField: "id" });
    const [url, body, config] = mockedAxios.post.mock.calls[0];
    expect(url).toContain("uploadType=resumable");
    expect(body).toEqual({ name: "video.mp4", parents: ["fld1"] });
    expect(config.headers.Authorization).toBe("Bearer tok");
    expect(config.headers["X-Upload-Content-Type"]).toBe("video/mp4");
    expect(config.headers["X-Upload-Content-Length"]).toBe("1234");
  });

  it("makes the file public on confirmUpload using the drive file id", async () => {
    const row = connectedRow("googledrive");
    mockedAxios.post.mockResolvedValue({ data: {} });
    const provider = new GoogleDriveStorageProvider(row, asRepo(makeRepo([row])));
    await provider.confirmUpload("driveId9");
    const [url, body] = mockedAxios.post.mock.calls[0];
    expect(url).toContain("/files/driveId9/permissions");
    expect(body).toEqual({ role: "reader", type: "anyone" });
  });

  it("creates a key-tagged file when no sync file exists yet", async () => {
    const row = connectedRow("googledrive", { settings: JSON.stringify({ folderId: "fld1" }) });
    mockedAxios.get.mockResolvedValue({ data: { files: [] } });
    mockedAxios.post.mockResolvedValue({ headers: { location: "https://upload.session/new" }, data: {} });
    const provider = new GoogleDriveStorageProvider(row, asRepo(makeRepo([row])));
    const result = await provider.getReplaceUploadUrl("/ch1/files/group/t1/current.zip", "application/zip", 99);
    expect(result).toMatchObject({ url: "https://upload.session/new", method: "PUT", rawBody: true });
    expect(mockedAxios.get.mock.calls[0][1].params.q).toBe("appProperties has { key='b1Key' and value='/ch1/files/group/t1/current.zip' } and trashed=false");
    expect(mockedAxios.post.mock.calls[0][1]).toEqual({ name: "current.zip", parents: ["fld1"], appProperties: { b1Key: "/ch1/files/group/t1/current.zip" } });
    expect(mockedAxios.patch).not.toHaveBeenCalled();
  });

  it("opens a resumable PATCH on the existing sync file instead of creating another", async () => {
    const row = connectedRow("googledrive", { settings: JSON.stringify({ folderId: "fld1" }) });
    mockedAxios.get.mockResolvedValue({ data: { files: [{ id: "drv1", shared: true }] } });
    mockedAxios.patch.mockResolvedValue({ headers: { location: "https://upload.session/upd" }, data: {} });
    const provider = new GoogleDriveStorageProvider(row, asRepo(makeRepo([row])));
    const result = await provider.getReplaceUploadUrl("/ch1/files/group/t1/current.zip", "application/zip", 99);
    expect(result).toMatchObject({ url: "https://upload.session/upd", method: "PUT", rawBody: true });
    const [url, , config] = mockedAxios.patch.mock.calls[0];
    expect(url).toContain("/files/drv1?uploadType=resumable");
    expect(config.headers["X-Upload-Content-Length"]).toBe("99");
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("shares an unshared sync file and returns its download url and markers", async () => {
    const row = connectedRow("googledrive");
    mockedAxios.get.mockResolvedValue({ data: { files: [{ id: "drv1", md5Checksum: "m5", modifiedTime: "2026-11-16T00:00:00Z", size: "42", shared: false }] } });
    mockedAxios.post.mockResolvedValue({ data: {} });
    const provider = new GoogleDriveStorageProvider(row, asRepo(makeRepo([row])));
    const info = await provider.getKeyedFileInfo("/ch1/files/group/t1/current.zip");
    expect(info).toEqual({ url: "https://drive.usercontent.google.com/download?id=drv1&export=download&confirm=t", md5: "m5", modified: "2026-11-16T00:00:00Z", size: 42 });
    expect(mockedAxios.post.mock.calls[0][0]).toContain("/files/drv1/permissions");
  });

  it("returns null info when the sync file has not been uploaded", async () => {
    const row = connectedRow("googledrive");
    mockedAxios.get.mockResolvedValue({ data: { files: [] } });
    const provider = new GoogleDriveStorageProvider(row, asRepo(makeRepo([row])));
    expect(await provider.getKeyedFileInfo("/ch1/files/group/t1/current.zip")).toBeNull();
  });

  it("mints webContentLink for downloads", async () => {
    const row = connectedRow("googledrive");
    mockedAxios.get.mockResolvedValue({ data: { webContentLink: "https://drive.google.com/uc?id=driveId9&export=download" } });
    const provider = new GoogleDriveStorageProvider(row, asRepo(makeRepo([row])));
    expect(await provider.getDownloadUrl("driveId9")).toContain("driveId9");
  });
});

describe("DropboxStorageProvider", () => {
  it("returns a temporary upload link as a raw-body POST keyed by path", async () => {
    const row = connectedRow("dropbox");
    mockedAxios.post.mockResolvedValue({ data: { link: "https://content.dropboxapi.com/tmp/abc" } });
    const provider = new DropboxStorageProvider(row, asRepo(makeRepo([row])));
    const result = await provider.getUploadUrl("/ch1/files/doc.pdf", "application/pdf", 99);
    expect(result).toEqual({ url: "https://content.dropboxapi.com/tmp/abc", fields: {}, key: "/ch1/files/doc.pdf", method: "POST", rawBody: true, headers: { "Content-Type": "application/octet-stream" } });
    const [url, body] = mockedAxios.post.mock.calls[0];
    expect(url).toContain("get_temporary_upload_link");
    expect(body.commit_info.path).toBe("/ch1/files/doc.pdf");
    expect(body.commit_info.mode).toBe("overwrite");
  });

  it("mints a temporary link for downloads", async () => {
    const row = connectedRow("dropbox");
    mockedAxios.post.mockResolvedValue({ data: { link: "https://dl.dropboxusercontent.com/tmp/xyz" } });
    const provider = new DropboxStorageProvider(row, asRepo(makeRepo([row])));
    expect(await provider.getDownloadUrl("/ch1/files/doc.pdf")).toBe("https://dl.dropboxusercontent.com/tmp/xyz");
    expect(mockedAxios.post.mock.calls[0][1]).toEqual({ path: "/ch1/files/doc.pdf" });
  });

  it("swallows not_found on remove", async () => {
    const row = connectedRow("dropbox");
    mockedAxios.post.mockRejectedValue({ response: { data: { error_summary: "path_lookup/not_found/..." } } });
    const provider = new DropboxStorageProvider(row, asRepo(makeRepo([row])));
    await expect(provider.remove("/ch1/files/doc.pdf")).resolves.toBeUndefined();
  });
});

describe("OneDriveStorageProvider", () => {
  it("creates an upload session and returns a chunked raw-body PUT", async () => {
    const row = connectedRow("onedrive");
    mockedAxios.post.mockResolvedValue({ data: { uploadUrl: "https://graph.upload/session" } });
    const provider = new OneDriveStorageProvider(row, asRepo(makeRepo([row])));
    const result = await provider.getUploadUrl("/ch1/files/big.mov", "video/quicktime", 999);
    expect(result).toEqual({ url: "https://graph.upload/session", fields: {}, key: "/ch1/files/big.mov", method: "PUT", rawBody: true, chunkSize: 20971520 });
    expect(result.chunkSize % 327680).toBe(0);
    const [url, body] = mockedAxios.post.mock.calls[0];
    expect(url).toContain("/me/drive/special/approot:/ch1/files/big.mov:/createUploadSession");
    expect(body.item["@microsoft.graph.conflictBehavior"]).toBe("replace");
  });

  it("mints the pre-authenticated download url", async () => {
    const row = connectedRow("onedrive");
    mockedAxios.get.mockResolvedValue({ data: { "@microsoft.graph.downloadUrl": "https://public.dl/abc" } });
    const provider = new OneDriveStorageProvider(row, asRepo(makeRepo([row])));
    expect(await provider.getDownloadUrl("/ch1/files/big.mov")).toBe("https://public.dl/abc");
  });
});

describe("S3CompatibleStorageProvider", () => {
  const row: StorageProvider = {
    id: "row1",
    churchId: "ch1",
    provider: "s3",
    apiKey: "AKIA123",
    apiSecret: "enc:secret",
    settings: JSON.stringify({ endpoint: "https://r2.example.com", region: "auto", bucket: "mybucket", publicBase: "https://files.mychurch.org/" })
  };

  it("returns a presigned raw-body PUT", async () => {
    const provider = new S3CompatibleStorageProvider(row);
    const result = await provider.getUploadUrl("/ch1/files/pic.jpg", "image/jpeg", 5);
    expect(result).toEqual({ url: "https://bucket.example.com/presigned-put", fields: {}, key: "/ch1/files/pic.jpg", method: "PUT", rawBody: true, headers: { "Content-Type": "image/jpeg" } });
    const command = (getSignedUrl as jest.Mock).mock.calls[0][1];
    expect(command.input).toEqual({ Bucket: "mybucket", Key: "ch1/files/pic.jpg", ContentType: "image/jpeg" });
  });

  it("builds stable public urls from publicBase without doubled slashes", async () => {
    const provider = new S3CompatibleStorageProvider(row);
    expect(await provider.getDownloadUrl("/ch1/files/pic.jpg")).toBe("https://files.mychurch.org/ch1/files/pic.jpg");
  });
});

describe("ByosAuth", () => {
  it("returns the decrypted token without refreshing when not expired", async () => {
    const row = connectedRow("dropbox");
    const repo = makeRepo([row]);
    expect(await ByosAuth.getAccessToken(asRepo(repo), row)).toBe("tok");
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("single-flights concurrent refreshes so a rotating refresh token is consumed once", async () => {
    const row = connectedRow("dropbox", { tokenExpiresAt: pastDate() });
    const repo = makeRepo([{ ...row }]);
    let resolveRefresh: (v: { data: Record<string, unknown> }) => void;
    mockedAxios.post.mockReturnValue(new Promise((resolve) => { resolveRefresh = resolve; }));

    const p1 = ByosAuth.getAccessToken(asRepo(repo), { ...row });
    const p2 = ByosAuth.getAccessToken(asRepo(repo), { ...row });
    resolveRefresh({ data: { access_token: "newTok", refresh_token: "rotated", expires_in: 3600 } });
    expect(await p1).toBe("newTok");
    expect(await p2).toBe("newTok");
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledTimes(1);

    const saved = repo.save.mock.calls[0][0];
    expect(saved.accessToken).toBe("enc:newTok");
    expect(saved.refreshToken).toBe("enc:rotated");
    const params = mockedAxios.post.mock.calls[0][1];
    expect(String(params)).toContain("grant_type=refresh_token");
    expect(String(params)).toContain("refresh_token=refresh");
  });

  it("skips the network refresh when a warm re-read finds a fresh token", async () => {
    const row = connectedRow("dropbox", { tokenExpiresAt: pastDate() });
    const freshRow = connectedRow("dropbox", { accessToken: "enc:alreadyRefreshed" });
    const repo = makeRepo([freshRow]);
    expect(await ByosAuth.getAccessToken(asRepo(repo), row)).toBe("alreadyRefreshed");
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});
