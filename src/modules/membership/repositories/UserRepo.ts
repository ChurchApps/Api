import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { User } from "../models/index.js";
import { DateHelper } from "../helpers/index.js";

@injectable()
export class UserRepo {
  public async save(model: User) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(user: User): Promise<User> {
    user.id = UniqueIdHelper.shortId();
    await getDb().insertInto("users").values({
      id: user.id,
      email: user.email,
      password: user.password,
      authGuid: user.authGuid,
      firstName: user.firstName,
      lastName: user.lastName
    }).execute();
    return user;
  }

  private async update(user: User): Promise<User> {
    const registrationDate = DateHelper.toMysqlDate(user.registrationDate);
    const lastLogin = DateHelper.toMysqlDate(user.lastLogin);
    await getDb().updateTable("users").set({
      email: user.email,
      password: user.password,
      authGuid: user.authGuid,
      firstName: user.firstName,
      lastName: user.lastName,
      registrationDate: registrationDate as any,
      lastLogin: lastLogin as any
    }).where("id", "=", user.id).execute();
    return user;
  }

  public async load(id: string): Promise<User> {
    return (await getDb().selectFrom("users").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
  }

  public async loadByEmail(email: string): Promise<User> {
    return (await getDb().selectFrom("users").selectAll().where("email", "=", email).executeTakeFirst()) ?? null;
  }

  public async loadByAuthGuid(authGuid: string): Promise<User> {
    return (await getDb().selectFrom("users").selectAll().where("authGuid", "=", authGuid).executeTakeFirst()) ?? null;
  }

  public async loadByEmailPassword(email: string, hashedPassword: string): Promise<User> {
    return (await getDb().selectFrom("users").selectAll().where("email", "=", email).where("password", "=", hashedPassword).executeTakeFirst()) ?? null;
  }

  public async loadByIds(ids: string[]): Promise<User[]> {
    if (!ids.length) return [];
    return getDb().selectFrom("users").selectAll().where("id", "in", ids).execute() as Promise<User[]>;
  }

  public async delete(id: string) {
    await getDb().deleteFrom("users").where("id", "=", id).execute();
  }

  public async loadCount() {
    const result = (await getDb().selectFrom("users").select(sql`COUNT(*)`.as("count")).executeTakeFirst()) ?? null;
    return parseInt((result as any)?.count || "0", 10);
  }

  public async search(term: string): Promise<User[]> {
    const searchTerm = `%${term}%`;
    return getDb().selectFrom("users")
      .select(["id", "email", "firstName", "lastName"])
      .where((eb) => eb.or([
        eb("email", "like", searchTerm),
        eb("firstName", "like", searchTerm),
        eb("lastName", "like", searchTerm)
      ]))
      .limit(50)
      .execute() as Promise<User[]>;
  }

  public convertToModel(_churchId: string, data: any) { return data; }
  public convertAllToModel(_churchId: string, data: any[]) { return data || []; }
}
