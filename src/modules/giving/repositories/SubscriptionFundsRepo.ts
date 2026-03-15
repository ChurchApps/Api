import { injectable } from "inversify";
import { eq, and } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { subscriptionFunds, funds } from "../../../db/schema/giving.js";
import { SubscriptionFund } from "../models/index.js";
import { FundRepo } from "./FundRepo.js";
import { CollectionHelper } from "../../../shared/helpers/index.js";

@injectable()
export class SubscriptionFundsRepo extends DrizzleRepo<typeof subscriptionFunds> {
  protected readonly table = subscriptionFunds;
  protected readonly moduleName = "giving";
  private fundRepository: FundRepo;

  constructor() {
    super();
    this.fundRepository = new FundRepo();
  }

  public async deleteBySubscriptionId(churchId: string, subscriptionId: string) {
    return this.db.delete(subscriptionFunds).where(and(eq(subscriptionFunds.subscriptionId, subscriptionId), eq(subscriptionFunds.churchId, churchId)));
  }

  public loadBySubscriptionId(churchId: string, subscriptionId: string) {
    return this.db.select({
      id: subscriptionFunds.id,
      churchId: subscriptionFunds.churchId,
      subscriptionId: subscriptionFunds.subscriptionId,
      fundId: subscriptionFunds.fundId,
      amount: subscriptionFunds.amount,
      name: funds.name
    })
      .from(subscriptionFunds)
      .leftJoin(funds, eq(subscriptionFunds.fundId, funds.id))
      .where(and(eq(subscriptionFunds.churchId, churchId), eq(subscriptionFunds.subscriptionId, subscriptionId)));
  }

  public async loadForSubscriptionLog(churchId: string, subscriptionId: string) {
    let result;
    const subscriptionFundRows = await this.db.select({
      id: subscriptionFunds.id,
      churchId: subscriptionFunds.churchId,
      subscriptionId: subscriptionFunds.subscriptionId,
      fundId: subscriptionFunds.fundId,
      amount: subscriptionFunds.amount,
      name: funds.name,
      removed: funds.removed
    })
      .from(subscriptionFunds)
      .leftJoin(funds, eq(subscriptionFunds.fundId, funds.id))
      .where(and(eq(subscriptionFunds.churchId, churchId), eq(subscriptionFunds.subscriptionId, subscriptionId))) as any[];
    if (subscriptionFundRows && subscriptionFundRows[0] && subscriptionFundRows[0].removed === false) {
      const { removed: _removed, ...sf } = subscriptionFundRows[0];
      result = [sf];
    } else if (subscriptionFundRows && subscriptionFundRows[0]) {
      const generalFund = await this.fundRepository.getOrCreateGeneral(churchId);
      const { removed: _removed, ...sf } = subscriptionFundRows[0];
      sf.fundId = generalFund.id;
      sf.name = generalFund.name;
      result = [sf];
    } else {
      result = [];
    }
    return result;
  }

  public convertToModel(churchId: string, data: any): SubscriptionFund {
    const result: SubscriptionFund = {
      id: data.id,
      churchId,
      subscriptionId: data.subscriptionId,
      fundId: data.fundId,
      amount: data.amount
    };
    return result;
  }

  public convertAllToModel(churchId: string, data: any) {
    return CollectionHelper.convertAll<SubscriptionFund>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
