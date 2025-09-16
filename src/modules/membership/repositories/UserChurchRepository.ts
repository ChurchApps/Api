import { injectable } from "inversify";
import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { UserChurch } from "../models";
import { ConfiguredRepository, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepository";

@injectable()
export class UserChurchRepository extends ConfiguredRepository<UserChurch> {
  protected get repoConfig(): RepoConfig<UserChurch> {
    return {
      tableName: "userChurches",
      hasSoftDelete: false,
      insertColumns: ["userId", "personId", "lastAccessed"],
      updateColumns: ["userId", "personId", "lastAccessed"]
    };
  }

  protected async create(userChurch: UserChurch): Promise<UserChurch> {
    const m: any = userChurch as any;
    if (!m[this.idColumn]) m[this.idColumn] = this.createId();
    m.lastAccessed = new Date();
    const { sql, params } = this.buildInsert(userChurch);
    await TypedDB.query(sql, params);
    return userChurch;
  }

  protected async update(userChurch: UserChurch): Promise<UserChurch> {
    const { sql, params } = this.buildUpdate(userChurch);
    await TypedDB.query(sql, params);
    return userChurch;
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
