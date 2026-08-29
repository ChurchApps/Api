import { controller, httpDelete, httpGet, httpPost, requestParam } from "inversify-express-utils";
import express from "express";
import { MessagingBaseController } from "./MessagingBaseController.js";
import { Connection } from "../models/index.js";
import { DeliveryHelper } from "../helpers/DeliveryHelper.js";

@controller("/messaging/connections")
export class ConnectionController extends MessagingBaseController {
  private async updateAnonName(connection: Connection) {
    if (connection.displayName === "Anonymous ") {
      const connections: Connection[] = await this.repos.connection.loadForConversation(connection.churchId, connection.conversationId);
      const numbers = connections
        .filter((c) => c.displayName.includes("Anonymous"))
        .map((c) => Number(c.displayName.split("_")[1]))
        .filter((n) => !Number.isNaN(n));
      const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
      connection.displayName = `Anonymous_${maxNumber + 1}`;
    }
  }

  @httpGet("/:churchId/:conversationId")
  public async load(@requestParam("churchId") churchId: string, @requestParam("conversationId") conversationId: string, req: express.Request<{}, {}, []>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      if (!(await this.canAccessConnection(churchId, conversationId))) return this.json([], 401);
      const data = await this.repos.connection.loadForConversation(churchId, conversationId);
      const connections = this.repos.connection.convertAllToModel(data);
      return connections;
    });
  }

  @httpPost("/")
  public async save(req: express.Request<{}, {}, Connection[]>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const au = this.authUser();

      // Pass 1 — authorize and resolve every entry before writing any of them. Rejecting from inside
      // the write loop left the earlier connections saved (and their attendance already broadcast) on
      // a 401, so a batch could half-populate the room's presence set.
      const planned: { connection: Connection; before: Connection }[] = [];
      for (const connection of req.body || []) {
        // "alerts" is a virtual per-person room with no conversation row; only its owner may join it.
        if (connection.conversationId === "alerts") {
          if (!this.isAuthenticated(au)) return this.json({}, 401);
          connection.churchId = au.churchId;
          connection.personId = au.personId || null;
          planned.push({ connection, before: await this.loadOwnedConnection(connection) });
          continue;
        }
        const convData = connection.conversationId ? await this.repos.conversation.loadByIdOnly(connection.conversationId) : null;
        const conv = convData ? this.repos.conversation.convertToModel(convData) : null;
        if (!conv) return this.json({}, 401);
        if (!(await this.canReadConversation(au, conv))) return this.json({}, 401);
        connection.churchId = conv.churchId;
        if (connection.personId === undefined) connection.personId = null;
        planned.push({ connection, before: await this.loadOwnedConnection(connection) });
      }

      // Pass 2 — writes only, one at a time so a failure part-way through can be compensated instead
      // of leaving the room holding a partial set of connections.
      const applied: { saved: Connection; before: Connection }[] = [];
      try {
        for (const { connection, before } of planned) {
          await this.updateAnonName(connection);
          applied.push({ saved: await this.repos.connection.save(connection), before });
        }
      } catch (error) {
        console.error("❌ Failed to save connection:", error);
        await this.undoConnectionWrites(applied);
        throw error;
      }

      const savedConnections = applied.map((a) => a.saved);
      // Broadcast once per room, and only once the whole set is durable.
      const rooms = new Map<string, Connection>();
      savedConnections.forEach((c) => rooms.set(c.churchId + "|" + c.conversationId, c));
      for (const c of rooms.values()) {
        await DeliveryHelper.sendAttendance(c.churchId, c.conversationId);
        await DeliveryHelper.sendBlockedIps(c.churchId, c.conversationId);
      }

      return this.repos.connection.convertAllToModel(savedConnections);
    });
  }

  @httpDelete("/:churchId/:conversationId/:socketId")
  public async leaveRoom(
    @requestParam("churchId") churchId: string,
    @requestParam("conversationId") conversationId: string,
    @requestParam("socketId") socketId: string,
      req: express.Request<{}, {}, null>,
      res: express.Response
  ): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      if (!(await this.canAccessConnection(churchId, conversationId))) return this.json({}, 401);
      await this.repos.connection.deleteForRoom(churchId, conversationId, socketId);
      await DeliveryHelper.sendAttendance(churchId, conversationId);
      return { success: true };
    });
  }

  @httpPost("/setName")
  public async setName(req: express.Request<{}, {}, { socketId: string; name: string }>, res: express.Response): Promise<any> {
    return this.actionWrapperAnon(req, res, async () => {
      const connections = await this.repos.connection.loadBySocketId(req.body.socketId);
      const au = this.authUser();
      const allowed: Connection[] = [];
      for (const connection of connections) {
        const convData = await this.repos.conversation.loadById(connection.churchId, connection.conversationId);
        const conv = convData ? this.repos.conversation.convertToModel(convData) : null;
        if (await this.canReadConversation(au, conv)) allowed.push(connection);
      }
      if (connections.length > 0 && allowed.length === 0) return this.json({}, 401);
      const promises: Promise<Connection>[] = [];
      allowed.forEach((connection: Connection) => {
        connection.displayName = req.body.name;
        promises.push(
          this.repos.connection.save(connection).then(async (c) => {
            await DeliveryHelper.sendAttendance(c.churchId, c.conversationId);
            return c;
          })
        );
      });
      return this.repos.connection.convertAllToModel(await Promise.all(promises));
    });
  }

  private async canAccessConnection(churchId: string, conversationId: string) {
    const data = await this.repos.conversation.loadById(churchId, conversationId);
    if (!data) return false;
    const conv = this.repos.conversation.convertToModel(data);
    return this.canReadConversation(this.authUser(), conv);
  }

  // A client-supplied connection id is only honoured when it already names this socket's connection in
  // this room — otherwise any anonymous caller could rename or claim another viewer's connection by
  // guessing its id. An unrecognized id is dropped (so a client reconnecting with a stale id still
  // joins) and doubles as the before-image for undoConnectionWrites.
  private async loadOwnedConnection(connection: Connection): Promise<Connection> {
    if (!connection.id) return null;
    const data = await this.repos.connection.loadById(connection.churchId, connection.id);
    const existing = data ? this.repos.connection.convertToModel(data) : null;
    if (existing && existing.conversationId === connection.conversationId && existing.socketId === connection.socketId) return existing;
    connection.id = undefined;
    return null;
  }

  // Presence has no transaction to roll back to, so compensate by hand: drop the rows this request
  // created and restore the ones it updated. Best-effort — a failed undo is logged, never rethrown, so
  // the original error is what the caller sees, and the stale row that ConnectionRepo.create evicts for
  // a reused socket stays evicted (that socket is reconnecting either way).
  private async undoConnectionWrites(applied: { saved: Connection; before: Connection }[]) {
    for (const { saved, before } of [...applied].reverse()) {
      try {
        if (before) await this.repos.connection.save(before);
        else await this.repos.connection.delete(saved.churchId, saved.id);
      } catch (error) {
        console.error("❌ Failed to roll back connection:", saved?.id, error);
      }
    }
  }
}
