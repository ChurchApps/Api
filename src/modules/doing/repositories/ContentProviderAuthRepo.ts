import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB.js";
import { ContentProviderAuth } from "../models/index.js";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo.js";

@injectable()
export class ContentProviderAuthRepo extends ConfiguredRepo<ContentProviderAuth> {
  protected get repoConfig(): RepoConfig<ContentProviderAuth> {
    return {
      tableName: "contentProviderAuths",
      hasSoftDelete: false,
      columns: ["ministryId", "providerId", "accessToken", "refreshToken", "tokenType", "expiresAt", "scope"]
    };
  }

  public loadByIds(churchId: string, ids: string[]) {
    return TypedDB.query("SELECT * FROM contentProviderAuths WHERE churchId=? and id in (?);", [churchId, ids]);
  }

  public loadByMinistry(churchId: string, ministryId: string) {
    return TypedDB.query("SELECT * FROM contentProviderAuths WHERE churchId=? AND ministryId=?;", [churchId, ministryId]);
  }

  public loadByMinistryAndProvider(churchId: string, ministryId: string, providerId: string) {
    return TypedDB.queryOne("SELECT * FROM contentProviderAuths WHERE churchId=? AND ministryId=? AND providerId=?;", [churchId, ministryId, providerId]);
  }

  protected rowToModel(row: any): ContentProviderAuth {
    return {
      id: row.id,
      churchId: row.churchId,
      ministryId: row.ministryId,
      providerId: row.providerId,
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      tokenType: row.tokenType,
      expiresAt: row.expiresAt ? new Date(row.expiresAt) : undefined,
      scope: row.scope
    };
  }
}
