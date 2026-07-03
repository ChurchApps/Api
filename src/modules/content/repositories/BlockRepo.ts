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
      siteId: model.siteId ?? "",
      blockType: model.blockType,
      name: model.name
    } as any).execute();
    return model;
  }

  private async update(model: Block): Promise<Block> {
    await getDb().updateTable("blocks").set({
      siteId: model.siteId ?? "",
      blockType: model.blockType,
      name: model.name
    } as any).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("blocks").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async load(churchId: string, id: string): Promise<Block | undefined> {
    return (await getDb().selectFrom("blocks").selectAll().where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
  }

  public async loadAll(churchId: string, siteId = ""): Promise<Block[]> {
    let query = getDb().selectFrom("blocks").selectAll().where("churchId", "=", churchId);
    // "" = shared only; a specific site sees shared blocks plus its own.
    query = siteId === "" ? query.where("siteId", "=", "") : query.where("siteId", "in", ["", siteId]);
    return query.orderBy("name").execute() as any;
  }

  public async loadByBlockType(churchId: string, blockType: string, siteId = "") {
    let query = getDb().selectFrom("blocks").selectAll()
      .where("churchId", "=", churchId)
      .where("blockType", "=", blockType);
    query = siteId === "" ? query.where("siteId", "=", "") : query.where("siteId", "in", ["", siteId]);
    return query.orderBy("name").execute() as any;
  }

  public convertToModel(_churchId: string, data: any) { return data as Block; }
  public convertAllToModel(_churchId: string, data: any[]) { return (data || []) as Block[]; }

  protected rowToModel(row: any): Block {
    return {
      id: row.id,
      churchId: row.churchId,
      siteId: row.siteId,
      blockType: row.blockType,
      name: row.name
    };
  }
}
