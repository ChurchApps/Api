import { injectable } from "inversify";
import { sql } from "kysely";
import { getDb } from "../db/index.js";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { User } from "../models/index.js";
import { DateHelper } from "../helpers/index.js";
import { AuthGuidHelper } from "../helpers/AuthGuidHelper.js";

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
      registrationDate: sql<Date>`${registrationDate}`,
      lastLogin: sql<Date>`${lastLogin}`
    }).where("id", "=", user.id).execute();
    return user;
  }

  public async updateVerification(userId: string, codeHash: string | null, expires: Date | null): Promise<void> {
    await getDb().updateTable("users").set({
      verificationCode: codeHash,
      verificationExpires: sql<Date>`${DateHelper.toMysqlDate(expires)}`,
      verificationAttempts: 0
    }).where("id", "=", userId).execute();
  }

  public async incrementVerificationAttempts(userId: string): Promise<number> {
    await getDb().updateTable("users").set({ verificationAttempts: sql<number>`verificationAttempts + 1` }).where("id", "=", userId).execute();
    const row = await getDb().selectFrom("users").select("verificationAttempts").where("id", "=", userId).executeTakeFirst();
    return parseInt(String(row?.verificationAttempts ?? "0"), 10);
  }

  // Single conditional UPDATE, so of N racing requests holding the right code exactly one consumes it.
  public async consumeVerification(userId: string, expectedHash: string): Promise<boolean> {
    if (!userId || !expectedHash) return false;
    const result = await getDb().updateTable("users")
      .set({ verificationCode: null, verificationExpires: null, verificationAttempts: 0 })
      .where("id", "=", userId)
      .where("verificationCode", "=", expectedHash)
      .executeTakeFirst();
    return Number(result?.numUpdatedRows ?? 0) > 0;
  }

  public async clearVerification(userId: string): Promise<void> {
    await getDb().updateTable("users").set({
      verificationCode: null,
      verificationExpires: null,
      verificationAttempts: 0
    }).where("id", "=", userId).execute();
  }

  public async load(id: string): Promise<User> {
    return (await getDb().selectFrom("users").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
  }

  public async loadByEmail(email: string): Promise<User> {
    return (await getDb().selectFrom("users").selectAll().where("email", "=", email).executeTakeFirst()) ?? null;
  }

  public async loadByAuthGuid(authGuid: string): Promise<User> {
    if (!authGuid) return null;
    const hashPrefix = AuthGuidHelper.hash(authGuid) + ":";
    return (await getDb().selectFrom("users").selectAll().where((eb) => eb.or([
      eb("authGuid", "=", authGuid),
      eb("authGuid", "like", hashPrefix + "%")
    ])).executeTakeFirst()) ?? null;
  }

  // Atomic consume: only the request that swaps the guid off its unused value proceeds.
  public async consumeAuthGuid(userId: string, expected: string, replacement: string): Promise<boolean> {
    if (!userId || !expected || expected === replacement) return false;
    const result = await getDb().updateTable("users")
      .set({ authGuid: replacement })
      .where("id", "=", userId)
      .where("authGuid", "=", expected)
      .executeTakeFirst();
    return Number(result?.numUpdatedRows ?? 0) > 0;
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
    const result = (await getDb().selectFrom("users").select(sql<number>`COUNT(*)`.as("count")).executeTakeFirst()) ?? null;
    return parseInt(String(result?.count || "0"), 10);
  }

  public async search(term: string): Promise<User[]> {
    const searchTerm = `%${term}%`;
    return getDb().selectFrom("users")
      .select(["id", "email", "firstName", "lastName", "registrationDate", "lastLogin"])
      .where((eb) => eb.or([
        eb("email", "like", searchTerm),
        eb("firstName", "like", searchTerm),
        eb("lastName", "like", searchTerm)
      ]))
      .orderBy("lastName").orderBy("firstName")
      .limit(50)
      .execute() as Promise<User[]>;
  }

  public convertToModel<T>(_churchId: string, data: T) { return data; }
  public convertAllToModel<T>(_churchId: string, data: T[]) { return data || []; }
}
