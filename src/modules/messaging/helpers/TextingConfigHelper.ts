import { EncryptionHelper } from "@churchapps/apihelper";
import { Environment } from "../../../shared/helpers/Environment.js";

export interface LoadedTextingConfig {
  providerName: string;
  churchId: string;
  apiKey: string;
  apiSecret: string;
  fromNumber?: string;
  baseUrl?: string;
}

export class TextingConfigHelper {
  // MinistryStuff is first-party: churches store no credentials; the service key + url come from our environment.
  static async load(textingProviderRepo: any, churchId: string): Promise<LoadedTextingConfig | null> {
    const rows = await textingProviderRepo.loadByChurchId(churchId);
    const list = textingProviderRepo.convertAllToModel(rows as any[]);
    if (!list.length) return null;
    const p = list[0];
    if (!p.enabled) return null;

    if (p.provider?.toLowerCase() === "ministrystuff") {
      return {
        providerName: p.provider,
        churchId,
        apiKey: "",
        apiSecret: Environment.ministryStuffServiceKey,
        baseUrl: Environment.ministryStuffApi
      };
    }

    return {
      providerName: p.provider,
      churchId,
      apiKey: p.apiKey ? EncryptionHelper.decrypt(p.apiKey) : "",
      apiSecret: p.apiSecret ? EncryptionHelper.decrypt(p.apiSecret) : "",
      fromNumber: p.fromNumber
    };
  }
}
