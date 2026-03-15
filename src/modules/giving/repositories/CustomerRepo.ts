import { injectable } from "inversify";
import { eq, and } from "drizzle-orm";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { customers } from "../../../db/schema/giving.js";
import { Customer } from "../models/index.js";

@injectable()
export class CustomerRepo extends DrizzleRepo<typeof customers> {
  protected readonly table = customers;
  protected readonly moduleName = "giving";

  public async save(model: Customer): Promise<Customer> {
    const existing = await this.loadByPersonId(model.churchId!, model.personId!);

    if (existing) {
      const oldId = existing.id;
      const newId = model.id || existing.id;

      if (newId !== oldId) {
        await this.delete(model.churchId!, oldId!);
        return await this.create(model);
      } else {
        model.id = existing.id;
        return await this.update(model);
      }
    } else {
      return await this.create(model);
    }
  }

  private async create(model: Customer): Promise<Customer> {
    const provider = model.provider ?? "stripe";
    const values = {
      id: model.id,
      churchId: model.churchId,
      personId: model.personId,
      provider,
      metadata: model.metadata ?? null
    };
    await this.db.insert(customers).values(values);
    return model;
  }

  private async update(model: Customer): Promise<Customer> {
    const provider = model.provider ?? "stripe";
    await this.db.update(customers).set({
      personId: model.personId,
      provider,
      metadata: model.metadata ?? null
    }).where(and(eq(customers.id, model.id!), eq(customers.churchId, model.churchId!)));
    return model;
  }

  public async delete(churchId: string, id: string): Promise<void> {
    await this.db.delete(customers).where(and(eq(customers.id, id), eq(customers.churchId, churchId)));
  }

  public load(churchId: string, id: string) {
    return this.db.select().from(customers).where(and(eq(customers.id, id), eq(customers.churchId, churchId))).then(r => r[0] ?? null);
  }

  public loadAll(churchId: string) {
    return this.db.select().from(customers).where(eq(customers.churchId, churchId));
  }

  public async loadByPersonId(churchId: string, personId: string) {
    return this.db.select().from(customers)
      .where(and(eq(customers.personId, personId), eq(customers.churchId, churchId)))
      .then(r => r[0] ?? null);
  }

  public async loadByPersonAndProvider(churchId: string, personId: string, provider: string) {
    return this.db.select().from(customers)
      .where(and(eq(customers.personId, personId), eq(customers.churchId, churchId), eq(customers.provider, provider)))
      .then(r => r[0] ?? null);
  }

  public convertToModel(_churchId: string, data: any): Customer {
    return data ? { id: data.id, churchId: data.churchId, personId: data.personId, provider: data.provider, metadata: data.metadata } : null as any;
  }

  public convertAllToModel(churchId: string, data: any[]) {
    return (data || []).map((d: any) => this.convertToModel(churchId, d));
  }
}
