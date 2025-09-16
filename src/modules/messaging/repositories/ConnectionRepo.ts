import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { Connection } from "../models";
import { ViewerInterface } from "../helpers/Interfaces";
import { ConfiguredRepo, RepoConfig } from "../../../shared/infrastructure/ConfiguredRepo";
import { injectable } from "inversify";

@injectable()
export class ConnectionRepo extends ConfiguredRepo<Connection> {
  protected get repoConfig(): RepoConfig<Connection> {
    return {
      tableName: "connections",
      hasSoftDelete: false,
      insertColumns: ["conversationId", "personId", "displayName", "socketId", "ipAddress"],
      updateColumns: ["personId", "displayName"],
      insertLiterals: { timeJoined: "NOW()" }
    };
  }

  // Override create to handle deleteExisting logic
  protected async create(connection: Connection): Promise<Connection> {
    if (!connection.id) connection.id = this.createId();
    await this.deleteExisting(connection.churchId, connection.conversationId, connection.socketId, connection.id);
    return super.create(connection);
  }
  public async loadAttendance(churchId: string, conversationId: string) {
    const sql = "SELECT id, displayName, ipAddress FROM connections WHERE churchId=? AND conversationId=? ORDER BY displayName;";
    const result: any = await TypedDB.query(sql, [churchId, conversationId]);
    const data: ViewerInterface[] = result || [];
    data.forEach((d: ViewerInterface) => {
      if (d.displayName === "") d.displayName = "Anonymous";
    });
    return data;
  }

  public async loadById(churchId: string, id: string) {
    const result: any = await TypedDB.queryOne("SELECT * FROM connections WHERE id=? and churchId=?;", [id, churchId]);
    return result || {};
  }

  public async loadForConversation(churchId: string, conversationId: string) {
    const result: any = await TypedDB.query("SELECT * FROM connections WHERE churchId=? AND conversationId=?", [churchId, conversationId]);
    return result || [];
  }

  public async loadForNotification(churchId: string, personId: string) {
    const result: any = await TypedDB.query("SELECT * FROM connections WHERE churchId=? AND personId=? and conversationId='alerts'", [churchId, personId]);
    return result || [];
  }

  public async loadBySocketId(socketId: string) {
    const result: any = await TypedDB.query("SELECT * FROM connections WHERE socketId=?", [socketId]);
    return result || [];
  }

  public delete(churchId: string, id: string) {
    return TypedDB.query("DELETE FROM connections WHERE id=? AND churchId=?;", [id, churchId]);
  }

  public deleteForSocket(socketId: string) {
    return TypedDB.query("DELETE FROM connections WHERE socketId=?;", [socketId]);
  }

  public deleteExisting(churchId: string, conversationId: string, socketId: string, id: string) {
    const sql = "DELETE FROM connections WHERE churchId=? AND conversationId=? AND socketId=? AND id<>?;";
    const params = [churchId, conversationId, socketId, id];
    return TypedDB.query(sql, params);
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

  public convertAllToModel(data: any) {
    return this.mapToModels(data);
  }
}
