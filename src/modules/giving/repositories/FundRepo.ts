import { injectable } from "inversify";
import { ConfiguredRepo, type RepoConfig } from "../../../shared/infrastructure/index.js";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { Fund } from "../models/index.js";

@injectable()
export class FundRepo extends ConfiguredRepo<Fund> {
  protected get repoConfig(): RepoConfig<Fund> {
    return {
      tableName: "funds",
      hasSoftDelete: true,
      defaultOrderBy: "name",
      columns: ["name", "taxDeductible", "productId"],
      insertLiterals: { removed: "0" }
    };
  }

  public async getOrCreateGeneral(churchId: string) {
    const data = await TypedDB.queryOne("SELECT * FROM funds WHERE churchId=? AND name='(General Fund)' AND removed=0;", [churchId]);

    if (data !== null) return this.convertToModel(churchId, data);
    else {
      const fund: Fund = { churchId, name: "(General Fund)" };
      const result = await this.save(fund);
      return result;
    }
  }

  protected rowToModel(data: any): Fund {
    const result: Fund = {
      id: data.id,
      name: data.name,
      churchId: data.churchId,
      productId: data.productId,
      taxDeductible: data.taxDeductible
    };
    return result;
  }
}
