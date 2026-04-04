import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { SubscriptionFund } from "../models/index.js";
import { FundRepo } from "./FundRepo.js";

@injectable()
export class SubscriptionFundsRepo {
  private fundRepository: FundRepo;

  constructor() {
    this.fundRepository = new FundRepo();
  }

  public async save(model: SubscriptionFund) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: SubscriptionFund): Promise<SubscriptionFund> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("subscriptionFunds").values({
      id: model.id,
      churchId: model.churchId,
      subscriptionId: model.subscriptionId,
      fundId: model.fundId,
      amount: model.amount
    } as any).execute();
    return model;
  }

  private async update(model: SubscriptionFund): Promise<SubscriptionFund> {
    await getDb().updateTable("subscriptionFunds").set({
      subscriptionId: model.subscriptionId,
      fundId: model.fundId,
      amount: model.amount
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("subscriptionFunds").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string) {
    return (await getDb().selectFrom("subscriptionFunds").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string) {
    return getDb().selectFrom("subscriptionFunds").selectAll().where("churchId", "=", churchId).execute();
  }

  public async deleteBySubscriptionId(churchId: string, subscriptionId: string) {
    await getDb().deleteFrom("subscriptionFunds")
      .where("subscriptionId", "=", subscriptionId)
      .where("churchId", "=", churchId)
      .execute();
  }

  public async loadBySubscriptionId(churchId: string, subscriptionId: string) {
    const result = await sql<any>`
      SELECT subscriptionFunds.*, funds.name
      FROM subscriptionFunds
      LEFT JOIN funds ON subscriptionFunds.fundId = funds.id
      WHERE subscriptionFunds.churchId = ${churchId}
        AND subscriptionFunds.subscriptionId = ${subscriptionId}`.execute(getDb());
    return result.rows;
  }

  // If the fund gets deleted for a recurring donation, the donations will go to '(General Fund)'
  public async loadForSubscriptionLog(churchId: string, subscriptionId: string) {
    let result;
    const queryResult = await sql<any>`
      SELECT subscriptionFunds.*, funds.name, funds.removed
      FROM subscriptionFunds
      LEFT JOIN funds ON subscriptionFunds.fundId = funds.id
      WHERE subscriptionFunds.churchId = ${churchId}
        AND subscriptionFunds.subscriptionId = ${subscriptionId}`.execute(getDb());
    const subscriptionFund = queryResult.rows;

    if (subscriptionFund && subscriptionFund[0] && subscriptionFund[0].removed === false) {
      const { removed: _removed, ...sf } = subscriptionFund[0];
      result = [sf];
    } else if (subscriptionFund && subscriptionFund[0]) {
      // Fund was deleted, use general fund instead
      const generalFund = await this.fundRepository.getOrCreateGeneral(churchId);
      const { removed: _removed, ...sf } = subscriptionFund[0];
      sf.fundId = generalFund.id;
      sf.name = generalFund.name;
      result = [sf];
    } else {
      // No subscription fund found, return empty array
      result = [];
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

  public convertAllToModel(churchId: string, data: any[]) {
    return data.map((d: any) => this.convertToModel(churchId, d));
  }
}
