import { StorageProviderFactory, type IStorageProvider } from "@churchapps/apihelper";
import { Environment } from "../../../shared/helpers/Environment.js";
import { MinistryStuffStorageProvider } from "./MinistryStuffStorageProvider.js";
import { GoogleDriveStorageProvider } from "./GoogleDriveStorageProvider.js";
import { DropboxStorageProvider } from "./DropboxStorageProvider.js";
import { OneDriveStorageProvider } from "./OneDriveStorageProvider.js";
import { S3CompatibleStorageProvider } from "./S3CompatibleStorageProvider.js";
import { BYOS_PROVIDERS } from "./ByosAuth.js";
import { StorageProvider, File } from "../models/index.js";

let registered = false;
const ensureRegistered = () => {
  if (registered) return;
  StorageProviderFactory.register("ministrystuff", new MinistryStuffStorageProvider());
  registered = true;
};

// BYOS providers hold per-church credentials, so they are constructed per request
// from the church's storageProviders row rather than registered as factory singletons.
const buildByosProvider = (row: StorageProvider, repo: any): IStorageProvider => {
  switch (row.provider) {
    case "googledrive": return new GoogleDriveStorageProvider(row, repo);
    case "dropbox": return new DropboxStorageProvider(row, repo);
    case "onedrive": return new OneDriveStorageProvider(row, repo);
    case "s3": return new S3CompatibleStorageProvider(row);
    default: throw new Error("Unknown BYOS provider: " + row.provider);
  }
};

export class StorageResolver {
  static async forChurch(storageProviderRepo: any, churchId: string): Promise<{ name: string; provider: IStorageProvider }> {
    ensureRegistered();
    const rows = await storageProviderRepo.loadByChurchId(churchId);
    const list = storageProviderRepo.convertAllToModel(rows as any[]);
    const p = list.find((x: any) => x.enabled);
    if (p && BYOS_PROVIDERS.includes(p.provider)) {
      return { name: p.provider, provider: buildByosProvider(p, storageProviderRepo) };
    }
    if (p && StorageProviderFactory.isAvailable(p.provider)) {
      return { name: p.provider.toLowerCase(), provider: StorageProviderFactory.getProvider(p.provider) };
    }
    return { name: "churchapps", provider: StorageProviderFactory.getDefault() };
  }

  // Deletes/downloads must target the provider that holds the bytes. BYOS files carry it
  // on the row (files.provider); legacy files are derived from the stored URL.
  static async forFile(storageProviderRepo: any, file: File): Promise<{ name: string; provider: IStorageProvider } | null> {
    if (!file?.provider) return StorageResolver.forUrl(file?.contentPath);
    ensureRegistered();
    if (!BYOS_PROVIDERS.includes(file.provider)) {
      if (StorageProviderFactory.isAvailable(file.provider)) return { name: file.provider, provider: StorageProviderFactory.getProvider(file.provider) };
      return StorageResolver.forUrl(file.contentPath);
    }
    const rows = await storageProviderRepo.loadByChurchId(file.churchId);
    const list = storageProviderRepo.convertAllToModel(rows as any[]);
    const row = list.find((x: StorageProvider) => x.provider === file.provider);
    if (!row) return null;
    return { name: row.provider, provider: buildByosProvider(row, storageProviderRepo) };
  }

  static forUrl(contentPath: string | null | undefined): { name: string; provider: IStorageProvider } {
    ensureRegistered();
    const root = Environment.ministryStuffContentRoot;
    if (root && contentPath && contentPath.startsWith(root)) {
      return { name: "ministrystuff", provider: StorageProviderFactory.getProvider("ministrystuff") };
    }
    return { name: "churchapps", provider: StorageProviderFactory.getDefault() };
  }

  // Legacy files (no externalId): the true storage key is whatever the public URL serves.
  static keyFromUrl(contentPath: string | null | undefined): string {
    const base = (contentPath || "").split("?")[0];
    const roots = [Environment.contentRoot, Environment.ministryStuffContentRoot].filter((r) => r);
    for (const root of roots) {
      const trimmed = root.replace(/\/$/, "");
      if (base.startsWith(trimmed)) return base.substring(trimmed.length);
    }
    return base;
  }

  static publicUrl(name: string, key: string): string {
    if (name === "ministrystuff") return Environment.ministryStuffContentRoot.replace(/\/$/, "") + key;
    return Environment.contentRoot + key;
  }
}
