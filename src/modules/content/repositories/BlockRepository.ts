import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { TypedDB } from "../helpers";
import { Block } from "../models";

import { CollectionHelper } from "../../../shared/helpers";

@injectable()
export class BlockRepository {
  public save(block: Block) {
    return block.id ? this.update(block) : this.create(block);
  }

  private async create(block: Block) {
    block.id = UniqueIdHelper.shortId();

    const sql = "INSERT INTO blocks (id, churchId, blockType, name) VALUES (?, ?, ?, ?);";
    const params = [block.id, block.churchId, block.blockType, block.name];
    await TypedDB.query(sql, params);
    return block;
  }

  private async update(block: Block) {
    const sql = "UPDATE blocks SET blockType=?, name=? WHERE id=? and churchId=?";
    const params = [block.blockType, block.name, block.id, block.churchId];
    await TypedDB.query(sql, params);
    return block;
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM blocks WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public load(churchId: string, id: string) {
    return TypedDB.queryOne("SELECT * FROM blocks WHERE id=? AND churchId=? order by name;", [id, churchId]);
  }

  public loadAll(churchId: string) {
    return TypedDB.query("SELECT * FROM blocks WHERE churchId=? ORDER BY name;", [churchId]);
  }

  public loadByBlockType(churchId: string, blockType: string) {
    return TypedDB.query("SELECT * FROM blocks WHERE churchId=? and blockType=? ORDER BY name;", [churchId, blockType]);
  }

  public convertToModel(churchId: string, data: any): Block {
    const result: Block = {
      id: data.id,
      churchId: data.churchId,
      blockType: data.blockType,
      name: data.name
    };
    return result;
  }

  public convertAllToModel(churchId: string, data: any): Block[] {
    return CollectionHelper.convertAll<Block>(data, (d: any) => this.convertToModel(churchId, d));
  }
}
