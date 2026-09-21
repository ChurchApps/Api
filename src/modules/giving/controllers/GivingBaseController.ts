import { BaseController } from "../../../shared/infrastructure/index.js";
import { ExchangeRateHelper } from "../../../shared/helpers/ExchangeRateHelper.js";
import { Repos } from "../repositories/index.js";

export class GivingBaseController extends BaseController {
  public repos: Repos;

  constructor() {
    super("giving");
  }

  // The church currency is the first gateway's currency (same rule the apps use via CurrencyHelper.loadCurrency).
  // Rates always come from the server-side cache, never from the request.
  protected async loadChurchRates(churchId: string) {
    const gateways = (await this.repos.gateway.loadAll(churchId)) as any[];
    const currency = (gateways[0]?.currency || "usd").toLowerCase();
    const table = await ExchangeRateHelper.getRateTable(currency);
    return { currency, rates: table.rates, asOf: table.asOf };
  }
}
