import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Block } from "../models/index.js";

@injectable()
export class BlockRepo {
  public async save(model: Block) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(model: Block): Promise<Block> {
    model.id = UniqueIdHelper.shortId();
    await getDb().insertInto("blocks").values({
      id: model.id,
      churchId: model.churchId,
      blockType: model.blockType,
      name: model.name
    } as any).execute();
    return model;
  }

  private async update(model: Block): Promise<Block> {
    await getDb().updateTable("blocks").set({
      blockType: model.blockType,
      name: model.name
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("blocks").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Block | undefined> {
    return (await getDb().selectFrom("blocks").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string): Promise<Block[]> {
    return getDb().selectFrom("blocks").selectAll().where("churchId", "=", churchId).orderBy("name").execute() as any;
  }

  public async loadByBlockType(churchId: string, blockType: string) {
    return getDb().selectFrom("blocks").selectAll()
      .where("churchId", "=", churchId)
      .where("blockType", "=", blockType)
      .orderBy("name").execute() as any;
  }

  public convertToModel(_churchId: string, data: any) { return data as Block; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as Block[]; }

  protected rowToModel(row: any): Block {
    return {
      id: row.id,
      churchId: row.churchId,
      blockType: row.blockType,
      name: row.name
    };
  }
}
