import { injectable } from "inversify";
import { eq, sql, inArray, like, or } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { GlobalDrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { users } from "../../../db/schema/membership.js";
import { User } from "../models/index.js";

@injectable()
export class UserRepo extends GlobalDrizzleRepo<typeof users> {
  protected readonly table = users;
  protected readonly moduleName = "membership";

  public async save(user: User) {
    if (user.id) {
      return this.update(user);
    } else {
      return this.create(user);
    }
  }

  protected async create(user: User): Promise<User> {
    user.id = UniqueIdHelper.shortId();
    const data: any = {
      id: user.id,
      email: user.email,
      password: user.password,
      authGuid: user.authGuid,
      firstName: user.firstName,
      lastName: user.lastName
    };
    await this.db.insert(users).values(data);
    return user;
  }

  protected async update(user: User): Promise<User> {
    const data: any = {
      email: user.email,
      password: user.password,
      authGuid: user.authGuid,
      firstName: user.firstName,
      lastName: user.lastName,
      registrationDate: user.registrationDate,
      lastLogin: user.lastLogin
    };
    await this.db.update(users).set(data).where(eq(users.id, user.id!));
    return user;
  }

  public load(id: string): Promise<User> {
    return this.db.select().from(users).where(eq(users.id, id)).then(r => (r[0] as User) ?? null);
  }

  public loadByEmail(email: string): Promise<User> {
    return this.db.select().from(users).where(eq(users.email, email)).then(r => (r[0] as User) ?? null);
  }

  public loadByAuthGuid(authGuid: string): Promise<User> {
    return this.db.select().from(users).where(eq(users.authGuid, authGuid)).then(r => (r[0] as User) ?? null);
  }

  public loadByEmailPassword(email: string, hashedPassword: string): Promise<User> {
    return this.db.select().from(users)
      .where(sql`email = ${email} AND password = ${hashedPassword}`)
      .then(r => (r[0] as User) ?? null);
  }

  public loadByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.db.select().from(users).where(inArray(users.id, ids)) as Promise<User[]>;
  }

  public async loadCount() {
    const rows = await this.executeRows(sql`SELECT COUNT(*) as count FROM users`);
    return parseInt(rows[0].count, 10);
  }

  public async search(term: string): Promise<User[]> {
    const searchTerm = `%${term}%`;
    return this.db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName
    }).from(users)
      .where(or(
        like(users.email, searchTerm),
        like(users.firstName, searchTerm),
        like(users.lastName, searchTerm)
      ))
      .limit(50) as Promise<User[]>;
  }
}
