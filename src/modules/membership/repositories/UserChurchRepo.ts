import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { UserChurch } from "../models";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";

@injectable()
export class UserChurchRepo extends ConfiguredRepo<UserChurch> {
  protected get repoConfig(): RepoConfig<UserChurch> {
    return {
      tableName: "userChurches",
      hasSoftDelete: false,
      columns: ["userId", "personId", "lastAccessed"]
    };
  }

  protected async create(userChurch: UserChurch): Promise<UserChurch> {
    userChurch.lastAccessed = new Date();
    return super.create(userChurch);
  }

  public async delete(userId: string): Promise<any> {
    const query = "DELETE FROM userChurches WHERE userId=?";
    return TypedDB.query(query, [userId]);
  }

  public deleteRecord(userId: string, churchId: string, personId: string) {
    const sql = "DELETE FROM userChurches WHERE userId=? AND churchId=? AND personId=?;";
    return TypedDB.query(sql, [userId, churchId, personId]);
  }

  public async load(userChurchId: string): Promise<UserChurch> {
    const sql = "SELECT * FROM userChurches WHERE id=?";
    const params = [userChurchId];
    return TypedDB.queryOne(sql, params);
  }

  public loadByUserId(userId: string, churchId: string) {
    const sql = "SELECT * FROM userChurches WHERE userId=? AND churchId=?";
    const params = [userId, churchId];
    return TypedDB.queryOne(sql, params);
  }

  protected rowToModel(row: any): UserChurch {
    return {
      id: row.id,
      userId: row.userId,
      churchId: row.churchId,
      personId: row.personId,
      lastAccessed: row.lastAccessed
    };
  }
}
