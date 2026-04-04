import { sql } from "kysely";
import { injectable } from "inversify";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { getDb } from "../db/index.js";
import { Connection } from "../models/index.js";
import { ViewerInterface } from "../helpers/Interfaces.js";

@injectable()
export class ConnectionRepo {
  public async save(model: Connection) {
    return model.id ? this.update(model) : this.create(model);
  }

  private async create(connection: Connection): Promise<Connection> {
    connection.id = UniqueIdHelper.shortId();
    // Delete existing connections for same church/conversation/socket before creating
    await this.deleteExisting(connection.churchId, connection.conversationId, connection.socketId, connection.id);
    await getDb().insertInto("connections").values({
      id: connection.id,
      churchId: connection.churchId,
      conversationId: connection.conversationId,
      personId: connection.personId,
      displayName: connection.displayName,
      socketId: connection.socketId,
      ipAddress: connection.ipAddress,
      timeJoined: sql`NOW()`
    }).execute();
    return connection;
  }

  private async update(model: Connection): Promise<Connection> {
    await getDb().updateTable("connections").set({
      personId: model.personId,
      displayName: model.displayName
    }).where("id", "=", model.id).where("churchId", "=", model.churchId).execute();
    return model;
  }

  public async loadAttendance(churchId: string, conversationId: string) {
    const data = await getDb().selectFrom("connections")
      .select(["id", "displayName", "ipAddress"])
      .where("churchId", "=", churchId)
      .where("conversationId", "=", conversationId)
      .orderBy("displayName")
      .execute();
    const result: ViewerInterface[] = data as any;
    result.forEach((d: ViewerInterface) => {
      if (d.displayName === "") d.displayName = "Anonymous";
    });
    return result;
  }

  public async loadById(churchId: string, id: string) {
    const result = (await getDb().selectFrom("connections").selectAll()
      .where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst()) ?? null;
    return result || {};
  }

  public async loadForConversation(churchId: string, conversationId: string) {
    return getDb().selectFrom("connections").selectAll()
      .where("churchId", "=", churchId)
      .where("conversationId", "=", conversationId)
      .execute();
  }

  public async loadForNotification(churchId: string, personId: string) {
    return getDb().selectFrom("connections").selectAll()
      .where("churchId", "=", churchId)
      .where("personId", "=", personId)
      .where("conversationId", "=", "alerts")
      .execute();
  }

  public async loadBySocketId(socketId: string) {
    return getDb().selectFrom("connections").selectAll()
      .where("socketId", "=", socketId)
      .execute();
  }

  public async delete(churchId: string, id: string) {
    await getDb().deleteFrom("connections").where("id", "=", id).where("churchId", "=", churchId).execute();
  }

  public async deleteForSocket(socketId: string) {
    await getDb().deleteFrom("connections").where("socketId", "=", socketId).execute();
  }

  public async deleteExisting(churchId: string, conversationId: string, socketId: string, id: string) {
    await getDb().deleteFrom("connections")
      .where("churchId", "=", churchId)
      .where("conversationId", "=", conversationId)
      .where("socketId", "=", socketId)
      .where("id", "<>", id)
      .execute();
  }

  protected rowToModel(data: any): Connection {
    return {
      id: data.id,
      churchId: data.churchId,
      conversationId: data.conversationId,
      personId: data.personId,
      displayName: data.displayName,
      timeJoined: data.timeJoined,
      socketId: data.socketId,
      ipAddress: data.ipAddress
    };
  }

  public convertToModel(data: any) {
    return this.rowToModel(data);
  }

  public convertAllToModel(data: any[]) {
    return data.map((d: any) => this.rowToModel(d));
  }
}
