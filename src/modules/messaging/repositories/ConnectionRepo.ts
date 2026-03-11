import { injectable } from "inversify";
import { eq, and, ne, sql } from "drizzle-orm";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { DrizzleRepo } from "../../../shared/infrastructure/DrizzleRepo.js";
import { connections } from "../../../db/schema/messaging.js";
import { ViewerInterface } from "../helpers/Interfaces.js";

@injectable()
export class ConnectionRepo extends DrizzleRepo<typeof connections> {
  protected readonly table = connections;
  protected readonly moduleName = "messaging";

  public async save(model: any) {
    if (model.id) {
      await this.db.update(connections).set(model)
        .where(and(eq(connections.id, model.id), eq(connections.churchId, model.churchId)));
    } else {
      model.id = UniqueIdHelper.shortId();
      await this.deleteExisting(model.churchId, model.conversationId, model.socketId, model.id);
      model.timeJoined = new Date();
      await this.db.insert(connections).values(model);
    }
    return model;
  }

  public async loadAttendance(churchId: string, conversationId: string) {
    const result = await this.db.select({
      id: connections.id,
      displayName: connections.displayName,
      ipAddress: connections.ipAddress,
    })
      .from(connections)
      .where(and(eq(connections.churchId, churchId), eq(connections.conversationId, conversationId)))
      .orderBy(connections.displayName);
    const data: ViewerInterface[] = result || [];
    data.forEach((d: ViewerInterface) => {
      if (d.displayName === "") d.displayName = "Anonymous";
    });
    return data;
  }

  public async loadById(churchId: string, id: string) {
    const result = await this.db.select().from(connections)
      .where(and(eq(connections.id, id), eq(connections.churchId, churchId)))
      .then(r => r[0] ?? null);
    return result || {};
  }

  public async loadForConversation(churchId: string, conversationId: string) {
    const result = await this.db.select().from(connections)
      .where(and(eq(connections.churchId, churchId), eq(connections.conversationId, conversationId)));
    return result || [];
  }

  public async loadForNotification(churchId: string, personId: string) {
    const result = await this.db.select().from(connections)
      .where(and(
        eq(connections.churchId, churchId),
        eq(connections.personId, personId),
        eq(connections.conversationId, "alerts")
      ));
    return result || [];
  }

  public async loadBySocketId(socketId: string) {
    const result = await this.db.select().from(connections)
      .where(eq(connections.socketId, socketId));
    return result || [];
  }

  public async delete(churchId: string, id: string) {
    await this.db.delete(connections)
      .where(and(eq(connections.id, id), eq(connections.churchId, churchId)));
  }

  public async deleteForSocket(socketId: string) {
    await this.db.delete(connections).where(eq(connections.socketId, socketId));
  }

  public async deleteExisting(churchId: string, conversationId: string, socketId: string, id: string) {
    await this.db.delete(connections)
      .where(and(
        eq(connections.churchId, churchId),
        eq(connections.conversationId, conversationId),
        eq(connections.socketId, socketId),
        ne(connections.id, id)
      ));
  }
}
