import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { CollectionHelper } from "../../../shared/helpers";
import { SubscriptionFund } from "../models";

import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class SubscriptionFundsRepository extends ConfiguredRepository<SubscriptionFund> {
  // Note: This repository will need dependency injection for FundRepository
  // to replace the static Repositories.getCurrent() call
  private fundRepository: any; // Will be injected by the container

  protected get repoConfig(): RepoConfig<SubscriptionFund> {
    return {
      tableName: "subscriptionFunds",
      hasSoftDelete: false,
      columns: ["subscriptionId", "fundId", "amount"]
    };
  }

  public async deleteBySubscriptionId(churchId: string, subscriptionId: string) {
    return TypedDB.query("DELETE FROM subscriptionFunds WHERE subscriptionId=? AND churchId=?;", [subscriptionId, churchId]);
  }

  public loadBySubscriptionId(churchId: string, subscriptionId: string) {
    const sql =
      "SELECT subscriptionFunds.*, funds.name FROM subscriptionFunds" +
      " LEFT JOIN funds ON subscriptionFunds.fundId = funds.id" +
      " WHERE subscriptionFunds.churchId=? AND subscriptionFunds.subscriptionId=?";
    return TypedDB.query(sql, [churchId, subscriptionId]);
  }

  // If the fund gets deleted for a recurring donation, the donations will go to '(General Fund)'
  public async loadForSubscriptionLog(churchId: string, subscriptionId: string) {
    let result;
    const sql =
      "SELECT subscriptionFunds.*, funds.name, funds.removed FROM subscriptionFunds" +
      " LEFT JOIN funds ON subscriptionFunds.fundId = funds.id" +
      " WHERE subscriptionFunds.churchId=? AND subscriptionFunds.subscriptionId=?";
    const subscriptionFund = await TypedDB.query(sql, [churchId, subscriptionId]);
    if (subscriptionFund && subscriptionFund[0].removed === false) {
      const { removed: _removed, ...sf } = (subscriptionFund as any)[0];
      result = [sf];
    } else {
      // TODO: This needs to be updated to use dependency injection
      // const generalFund = await this.fundRepository.getOrCreateGeneral(churchId);
      const { removed: _removed, ...sf } = (subscriptionFund as any)[0];
      // sf.fundId = generalFund.id;
      // sf.name = generalFund.name;
      result = [sf];
    }
    return result;
  }

  public convertToModel(churchId: string, data: any) {
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
