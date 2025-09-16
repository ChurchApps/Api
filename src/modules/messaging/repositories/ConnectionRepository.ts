import { TypedDB } from "../../../shared/infrastructure/TypedDB";
import { UniqueIdHelper } from "@churchapps/apihelper";
import { Connection } from "../models";
import { CollectionHelper } from "../../../shared/helpers";
import { ViewerInterface } from "../helpers/Interfaces";

export class ConnectionRepository {
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

  public save(connection: Connection) {
    return connection.id ? this.update(connection) : this.create(connection);
  }

  private async create(connection: Connection): Promise<Connection> {
    connection.id = UniqueIdHelper.shortId();
    await this.deleteExisting(connection.churchId, connection.conversationId, connection.socketId, connection.id);
    const sql = "INSERT INTO connections (id, churchId, conversationId, personId, displayName, timeJoined, socketId, ipAddress) VALUES (?, ?, ?, ?, ?, NOW(), ?, ?);";
    const params = [connection.id, connection.churchId, connection.conversationId, connection.personId, connection.displayName, connection.socketId, connection.ipAddress];
    await TypedDB.query(sql, params);
    return connection;
  }

  private async update(connection: Connection) {
    const sql = "UPDATE connections SET personId=?, displayName=? WHERE id=? AND churchId=?;";
    const params = [connection.personId, connection.displayName, connection.id, connection.churchId];
    await TypedDB.query(sql, params);
    return connection;
  }

  public convertToModel(data: any) {
    const result: Connection = {
      id: data.id,
      churchId: data.churchId,
      conversationId: data.conversationId,
      personId: data.personId,
      displayName: data.displayName,
      timeJoined: data.timeJoined,
      socketId: data.socketId,
      ipAddress: data.ipAddress
    };
    return result;
  }

  public convertAllToModel(data: any) {
    return CollectionHelper.convertAll<Connection>(data, (d: any) => this.convertToModel(d));
  }
}
