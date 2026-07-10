import { StorageProviderFactory, type IStorageProvider } from "@churchapps/apihelper";
import { Environment } from "../../../shared/helpers/Environment.js";
import { MinistryStuffStorageProvider } from "./MinistryStuffStorageProvider.js";

let registered = false;
const ensureRegistered = () => {
  if (registered) return;
  StorageProviderFactory.register("ministrystuff", new MinistryStuffStorageProvider());
  registered = true;
};

export class StorageResolver {
  static async forChurch(storageProviderRepo: any, churchId: string): Promise<{ name: string; provider: IStorageProvider }> {
    ensureRegistered();
    const rows = await storageProviderRepo.loadByChurchId(churchId);
    const list = storageProviderRepo.convertAllToModel(rows as any[]);
    const p = list.find((x: any) => x.enabled);
    if (p && StorageProviderFactory.isAvailable(p.provider)) {
      return { name: p.provider.toLowerCase(), provider: StorageProviderFactory.getProvider(p.provider) };
    }
    return { name: "churchapps", provider: StorageProviderFactory.getDefault() };
  }

  // Deletes must target the provider that holds the bytes, which is derivable from the stored URL.
  static forUrl(contentPath: string | null | undefined): { name: string; provider: IStorageProvider } {
    ensureRegistered();
    const root = Environment.ministryStuffContentRoot;
    if (root && contentPath && contentPath.startsWith(root)) {
      return { name: "ministrystuff", provider: StorageProviderFactory.getProvider("ministrystuff") };
    }
    return { name: "churchapps", provider: StorageProviderFactory.getDefault() };
  }

  static publicUrl(name: string, key: string): string {
    if (name === "ministrystuff") return Environment.ministryStuffContentRoot.replace(/\/$/, "") + key;
    return Environment.contentRoot + key;
  }
}
