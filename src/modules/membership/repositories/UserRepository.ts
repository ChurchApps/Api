import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { User } from "../models";
import { DateHelper } from "../helpers";
import { BaseRepository } from "../../../shared/infrastructure/BaseRepository";
import { injectable } from "inversify";

@injectable()
export class UserRepository extends BaseRepository<User> {
  protected tableName = "users";
  protected hasSoftDelete = false;

  protected async create(user: User): Promise<User> {
    user.id = this.createId();
    const sql = "INSERT INTO users (id, email, password, authGuid, firstName, lastName) VALUES (?, ?, ?, ?, ?, ?);";
    const params = [user.id, user.email, user.password, user.authGuid, user.firstName, user.lastName];
    await TypedDB.query(sql, params);
    return user;
  }

  protected async update(user: User): Promise<User> {
    const registrationDate = DateHelper.toMysqlDate(user.registrationDate);
    const lastLogin = DateHelper.toMysqlDate(user.lastLogin);
    const sql = "UPDATE users SET email=?, password=?, authGuid=?, firstName=?, lastName=?, registrationDate=?, lastLogin=? WHERE id=?;";
    const params = [user.email, user.password, user.authGuid, user.firstName, user.lastName, registrationDate, lastLogin, user.id];
    await TypedDB.query(sql, params);
    return user;
  }

  public load(id: string): Promise<User> {
    return TypedDB.queryOne("SELECT * FROM users WHERE id=?", [id]) as Promise<User>;
  }

  public loadByEmail(email: string): Promise<User> {
    return TypedDB.queryOne("SELECT * FROM users WHERE email=?", [email]) as Promise<User>;
  }

  public loadByAuthGuid(authGuid: string): Promise<User> {
    return TypedDB.queryOne("SELECT * FROM users WHERE authGuid=?", [authGuid]) as Promise<User>;
  }

  public loadByEmailPassword(email: string, hashedPassword: string): Promise<User> {
    return TypedDB.queryOne("SELECT * FROM users WHERE email=? AND password=?", [email, hashedPassword]) as Promise<User>;
  }

  public loadByIds(ids: string[]): Promise<User[]> {
    return TypedDB.query("SELECT * FROM users WHERE id IN (?)", [ids]) as Promise<User[]>;
  }

  public delete(id: string) {
    return TypedDB.query("DELETE FROM users WHERE id=?", [id]);
  }

  public async loadCount() {
    const data = (await TypedDB.queryOne("SELECT COUNT(*) as count FROM users", [])) as { count: string };
    return parseInt(data.count, 0);
  }
}
