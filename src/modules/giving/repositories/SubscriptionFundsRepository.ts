import { injectable } from "inversify";
import { DB } from "../../../shared/infrastructure";
import { CollectionHelper } from "../../../shared/helpers";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { SubscriptionFund } from "../models";

@injectable()
export class SubscriptionFundsRepository {
  // Note: This repository will need dependency injection for FundRepository
  // to replace the static Repositories.getCurrent() call
  private fundRepository: any; // Will be injected by the container

  public async save(subscriptionFund: SubscriptionFund) {
    return subscriptionFund.id ? this.update(subscriptionFund) : this.create(subscriptionFund);
  }

  private async create(subscriptionFund: SubscriptionFund) {
    subscriptionFund.id = UniqueIdHelper.shortId();
    return DB.query("INSERT INTO subscriptionFunds (id, churchId, subscriptionId, fundId, amount) VALUES (?, ?, ?, ?, ?);", [
      subscriptionFund.id,
      subscriptionFund.churchId,
      subscriptionFund.subscriptionId,
      subscriptionFund.fundId,
      subscriptionFund.amount
    ]).then(() => {
      return subscriptionFund;
    });
  }

  private async update(subscriptionFund: SubscriptionFund) {
    const sql = "UPDATE subscriptionFunds SET churchId=?, subscriptionId=?, fundId=?, amount=? WHERE id=? and churchId=?";
    const params = [subscriptionFund.churchId, subscriptionFund.subscriptionId, subscriptionFund.fundId, subscriptionFund.amount, subscriptionFund.id, subscriptionFund.churchId];
    await DB.query(sql, params);
    return subscriptionFund;
  }

  public async delete(churchId: string, id: string) {
    return DB.query("DELETE FROM subscriptionFunds WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public async deleteBySubscriptionId(churchId: string, subscriptionId: string) {
    return DB.query("DELETE FROM subscriptionFunds WHERE subscriptionId=? AND churchId=?;", [subscriptionId, churchId]);
  }

  public async load(churchId: string, id: string) {
    return DB.queryOne("SELECT * FROM subscriptionFunds WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public loadBySubscriptionId(churchId: string, subscriptionId: string) {
    const sql =
      "SELECT subscriptionFunds.*, funds.name FROM subscriptionFunds" +
      " LEFT JOIN funds ON subscriptionFunds.fundId = funds.id" +
      " WHERE subscriptionFunds.churchId=? AND subscriptionFunds.subscriptionId=?";
    return DB.query(sql, [churchId, subscriptionId]);
  }

  // If the fund gets deleted for a recurring donation, the donations will go to '(General Fund)'
  public async loadForSubscriptionLog(churchId: string, subscriptionId: string) {
    let result;
    const sql =
      "SELECT subscriptionFunds.*, funds.name, funds.removed FROM subscriptionFunds" +
      " LEFT JOIN funds ON subscriptionFunds.fundId = funds.id" +
      " WHERE subscriptionFunds.churchId=? AND subscriptionFunds.subscriptionId=?";
    const subscriptionFund = await DB.query(sql, [churchId, subscriptionId]);
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

  public async loadAll(churchId: string) {
    return DB.query("SELECT * FROM subscriptionFunds WHERE churchId=?;", [churchId]);
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
