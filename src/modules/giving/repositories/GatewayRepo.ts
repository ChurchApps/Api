import { injectable } from "inversify";
import { eq, and, ne, sql } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { gateways } from "../../../db/schema/giving.js";
import { Gateway } from "../models/index.js";

@injectable()
export class GatewayRepo extends DrizzleRepo<typeof gateways> {
  protected readonly table = gateways;
  protected readonly moduleName = "giving";

  public override async save(model: Gateway) {
    if (model.id) {
      return this.update(model);
    } else {
      return this.create(model);
    }
  }

  private async create(gateway: Gateway): Promise<Gateway> {
    gateway.id = UniqueIdHelper.shortId();
    // enforce a single record per church (for now)
    await this.db.delete(gateways).where(and(eq(gateways.churchId, gateway.churchId!), ne(gateways.id, gateway.id)));
    await this.db.insert(gateways).values(gateway as any);
    return gateway;
  }

  private async update(gateway: Gateway): Promise<Gateway> {
    const { id: _id, churchId: _churchId, ...setData } = gateway as any;
    await this.db.update(gateways).set(setData)
      .where(and(eq(gateways.id, gateway.id!), eq(gateways.churchId, gateway.churchId!)));
    return gateway;
  }

  public convertToModel(_churchId: string, data: any) {
    const model = this.rowToModel(data);
    const { privateKey: _privateKey, webhookKey: _webhookKey, ...safeModel } = model;
    return safeModel;
  }

  public convertAllToModel(churchId: string, data: any) {
    return data.map((row: any) => this.convertToModel(churchId, row));
  }

  public async loadByProvider(provider: string): Promise<Gateway[]> {
    const rows = await this.db.select().from(gateways)
      .where(sql`LOWER(${gateways.provider}) = LOWER(${provider})`);
    return rows.map(r => this.rowToModel(r));
  }

  private rowToModel(data: any): Gateway {
    return {
      id: data.id,
      churchId: data.churchId,
      provider: data.provider,
      publicKey: data.publicKey,
      privateKey: data.privateKey,
      webhookKey: data.webhookKey,
      productId: data.productId,
      payFees: data.payFees,
      currency: data.currency,
      settings: data.settings,
      environment: data.environment,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  }
}
