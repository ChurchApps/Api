import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Block } from "../models";
import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class BlockRepository extends ConfiguredRepository<Block> {
  protected get repoConfig(): RepoConfig<Block> {
    return {
      tableName: "blocks",
      hasSoftDelete: false,
      defaultOrderBy: "name",
      columns: ["blockType", "name"]
    };
  }

  public loadByBlockType(churchId: string, blockType: string) {
    return TypedDB.query("SELECT * FROM blocks WHERE churchId=? and blockType=? ORDER BY name;", [churchId, blockType]);
  }

  protected rowToModel(row: any): Block {
    return {
      id: row.id,
      churchId: row.churchId,
      blockType: row.blockType,
      name: row.name
    };
  }
}
