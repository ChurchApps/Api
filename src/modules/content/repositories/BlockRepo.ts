import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Block } from "../models";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class BlockRepo extends ConfiguredRepo<Block> {
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
