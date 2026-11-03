import { BaseController } from "../../../shared/infrastructure/index.js";
import { ExchangeRateHelper } from "../../../shared/helpers/ExchangeRateHelper.js";
import { RepoManager } from "../../../shared/infrastructure/RepoManager.js";
import { Repos } from "../repositories/index.js";

export class GivingBaseController extends BaseController {
  public repos: Repos;

  constructor() {
    super("giving");
  }

  // What donors (and anyone without settings.edit) may see of a gateway: no keys, only the sandbox flag from settings.
  public static toPublicGateway(gateway: any) {
    const base: any = {
      id: gateway.id,
      provider: gateway.provider,
      publicKey: gateway.publicKey,
      productId: gateway.productId,
      payFees: gateway.payFees,
      currency: gateway.currency,
      enabled: gateway.enabled,
      environment: gateway.environment || null
    };
    if (gateway.settings) {
      try {
        const settings = typeof gateway.settings === "string" ? JSON.parse(gateway.settings) : gateway.settings;
        base.settings = { sandbox: settings.sandbox || false };
      } catch { /* ignore parse errors */ }
    }
    return base;
  }

  // The church currency is the first gateway's currency, else the church's "currency" setting, else usd
  // (same rule the apps use via CurrencyHelper.loadCurrency). Rates always come from the server-side cache, never from the request.
  protected async loadChurchRates(churchId: string) {
    const gateways = (await this.repos.gateway.loadAll(churchId)) as any[];
    let currency = gateways[0]?.currency || "";
    if (!currency) {
      const membershipRepos = await RepoManager.getRepos<any>("membership");
      const settings = (await membershipRepos.setting.loadMulipleChurches(["currency"], [churchId]).catch((): any[] => [])) as any[];
      currency = settings[0]?.value || "";
    }
    currency = (currency || "usd").toLowerCase();
    const table = await ExchangeRateHelper.getRateTable(currency);
    return { currency, rates: table.rates, asOf: table.asOf };
  }
}
