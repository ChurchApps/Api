import { AuthenticatedUser, CustomBaseController } from "@churchapps/apihelper";
import { RepoManager } from "./RepoManager.js";
import { KyselyPool } from "./KyselyPool.js";
import express from "express";

export interface UndoArgs {
  db: any;
  membershipRepos: any;
  churchId: string;
  entityId: string;
  before: any;
  after: any;
  undoKind: "created" | "updated" | "deleted";
}

interface AuditRouteConfig {
  category?: string;
  entityType?: string;
  optOut?: boolean;
  sensitive?: boolean; // audit anonymous mutations on this route
  dbModule?: string;   // KyselyPool module for DELETE before-image + undo
  table?: string;
  onUndo?: (args: UndoArgs) => Promise<boolean>; // side-effect entities; return true if fully handled
}

interface BulkRouteConfig {
  category: string;
  entityType: string;
  action: string;
  op: "create" | "update" | "delete";
  idsFrom: (payload: any) => string[] | undefined;
  afterFrom?: (req: express.Request) => any;
}

interface AuditContext {
  optOut?: boolean;
  entityType?: string;
  category?: string;
  kind?: "save" | "delete" | "bulk" | "generic";
  action?: string;
  config?: AuditRouteConfig;
  bulk?: BulkRouteConfig;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function unwrapResult(result: any): { payload: any; statusCode: number } {
  if (result && typeof result === "object" && "json" in result && "statusCode" in result && typeof (result as any).statusCode === "number") {
    return { payload: (result as any).json, statusCode: (result as any).statusCode };
  }
  return { payload: result, statusCode: 200 };
}

function singularize(word: string): string {
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("sses") || word.endsWith("shes") || word.endsWith("ches") || word.endsWith("xes")) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function deriveEntityType(baseUrl: string): string {
  const segment = baseUrl.split("/").filter(Boolean).pop() || "entity";
  return singularize(segment.toLowerCase());
}

export class BaseController extends CustomBaseController {
  protected moduleName: string;

  // Overrides + opt-outs only. Everything not listed is audited with derived defaults.
  private static AUDIT_REGISTRY: Record<string, AuditRouteConfig> = {
    "/membership/people": { category: "person", entityType: "person", dbModule: "membership", table: "people" },
    "/membership/rolepermissions": { category: "permission", entityType: "rolePermission", dbModule: "membership", table: "rolePermissions" },
    "/membership/rolemembers": { category: "permission", entityType: "roleMember", dbModule: "membership", table: "roleMembers" },
    "/membership/groups": { category: "group", entityType: "group", dbModule: "membership", table: "groups" },
    "/membership/groupmembers": {
      category: "group",
      entityType: "groupMember",
      dbModule: "membership",
      table: "groupMembers",
      // groupMembers are keyed by row id on the explicit path but by personId on bulk endpoints,
      // and every add/remove must write groupMemberHistory or churn analytics break. Handle fully.
      onUndo: async ({ db, membershipRepos, churchId, entityId, before, after, undoKind }) => {
        const personId = after?.personId ?? before?.personId ?? entityId;
        const groupId = after?.groupId ?? before?.groupId;
        if (!groupId || !personId) return false;
        if (undoKind === "created") {
          await db.deleteFrom("groupMembers").where("churchId", "=", churchId).where("groupId", "=", groupId).where("personId", "=", personId).execute();
          await membershipRepos.groupMemberHistory.log(churchId, groupId, personId, "left");
        } else if (undoKind === "deleted") {
          const existing = await db.selectFrom("groupMembers").select("id").where("churchId", "=", churchId).where("groupId", "=", groupId).where("personId", "=", personId).executeTakeFirst();
          if (!existing) await membershipRepos.groupMember.save({ churchId, groupId, personId, leader: !!before?.leader });
          await membershipRepos.groupMemberHistory.log(churchId, groupId, personId, "joined");
        } else if (before) {
          await db.updateTable("groupMembers").set({ leader: !!before.leader, groupId: before.groupId, personId: before.personId }).where("id", "=", entityId).where("churchId", "=", churchId).execute();
        } else {
          return false; // update with no before-image: let the generic path report it
        }
        return true;
      }
    },
    "/membership/campuses": { category: "campus", entityType: "campus", dbModule: "membership", table: "campuses" },
    "/membership/forms": { category: "form", entityType: "form", dbModule: "membership", table: "forms" },
    "/membership/settings": { category: "settings", entityType: "setting", dbModule: "membership", table: "settings" },
    // Batch-capable import targets (B1Transfer writes these; without dbModule/table an undo leaves orphans).
    "/membership/households": { category: "person", entityType: "household", dbModule: "membership", table: "households" },
    "/membership/questions": { category: "form", entityType: "question", dbModule: "membership", table: "questions" },
    "/attendance/services": { category: "attendance", entityType: "service", dbModule: "attendance", table: "services" },
    "/attendance/servicetimes": { category: "attendance", entityType: "serviceTime", dbModule: "attendance", table: "serviceTimes" },
    "/attendance/groupservicetimes": { category: "attendance", entityType: "groupServiceTime", dbModule: "attendance", table: "groupServiceTimes" },
    "/giving/funds": { category: "fund", entityType: "fund", dbModule: "giving", table: "funds" },
    "/giving/donationbatches": { category: "donation", entityType: "donationBatch", dbModule: "giving", table: "donationBatches" },
    "/giving/funddonations": { category: "donation", entityType: "fundDonation", dbModule: "giving", table: "fundDonations" },
    "/giving/donations": { category: "donation", entityType: "donation", dbModule: "giving", table: "donations", sensitive: true },
    "/giving/donate": { category: "donation", entityType: "donation", sensitive: true },
    // Batch management is its own audited surface (undo writes _undone rows directly).
    "/membership/batches": { optOut: true },
    // Firehose opt-outs (Sunday check-in storm + chat/presence).
    "/attendance/visits": { optOut: true },
    "/attendance/visitsessions": { optOut: true },
    "/attendance/sessions": { optOut: true },
    "/attendance/checkin": { optOut: true },
    "/messaging/messages": { optOut: true },
    "/messaging/connections": { optOut: true },
    "/messaging/devices": { optOut: true }
  };

  // Per-entity audit for bulk endpoints (each touched id becomes one row).
  private static BULK_ROUTES: Record<string, BulkRouteConfig> = {
    "/membership/people/bulk-delete": { category: "person", entityType: "person", action: "person_deleted", op: "delete", idsFrom: (p) => p?.deletedIds },
    "/membership/people/bulk-update": { category: "person", entityType: "person", action: "person_saved", op: "update", idsFrom: (p) => p?.updatedIds, afterFrom: (req) => req.body?.updates },
    "/membership/groupmembers/bulk-add": { category: "group", entityType: "groupMember", action: "groupMember_saved", op: "create", idsFrom: (p) => p?.addedIds, afterFrom: (req) => ({ groupId: req.body?.groupId }) },
    "/membership/groupmembers/bulk-remove": { category: "group", entityType: "groupMember", action: "groupMember_deleted", op: "delete", idsFrom: (p) => p?.removedIds, afterFrom: (req) => ({ groupId: req.body?.groupId }) }
  };

  constructor(moduleName: string) {
    super();
    this.moduleName = moduleName;
  }

  protected async getRepos<T>(): Promise<T> {
    return await RepoManager.getRepos<T>(this.moduleName);
  }

  // Maps an audit row's (module, entityType) back to its registry entry for undo.
  public static resolveUndoConfig(module: string | undefined, entityType: string | undefined): AuditRouteConfig | undefined {
    if (!entityType) return undefined;
    for (const [route, cfg] of Object.entries(BaseController.AUDIT_REGISTRY)) {
      if (cfg.optOut || !cfg.dbModule || !cfg.table) continue;
      const et = cfg.entityType || deriveEntityType(route);
      if (et !== entityType) continue;
      if (module && !route.startsWith(`/${module}/`)) continue;
      return cfg;
    }
    return undefined;
  }

  // Real inversify-express-utils registers full-path routes on the app root: req.baseUrl is "" and
  // req.route.path is the whole pattern (e.g. "/membership/people/:id"). Unit-test mocks (and any
  // future per-controller router mounting) instead set req.baseUrl + a relative req.route.path.
  // Reconstruct the full path so both shapes resolve identically.
  private static fullRoutePath(req: express.Request): string {
    const routePath = ((req.route?.path as string) ?? req.path) || req.path;
    if (req.baseUrl) return req.baseUrl + (routePath === "/" ? "" : routePath);
    return routePath;
  }

  // Resolve the controller base (the registry key) from the full path — longest match wins.
  private static resolveRegistry(fullPath: string): { basePath: string; config: AuditRouteConfig } {
    let basePath = "";
    let config: AuditRouteConfig = {};
    for (const key of Object.keys(BaseController.AUDIT_REGISTRY)) {
      if ((fullPath === key || fullPath.startsWith(key + "/")) && key.length > basePath.length) {
        basePath = key;
        config = BaseController.AUDIT_REGISTRY[key];
      }
    }
    if (!basePath) {
      const segs = fullPath.split("/").filter(Boolean);
      basePath = segs.length >= 2 ? `/${segs[0]}/${segs[1]}` : `/${segs.join("/")}`;
    }
    return { basePath, config };
  }

  private buildAuditContext(req: express.Request): AuditContext | null {
    const fullPath = BaseController.fullRoutePath(req);
    const { basePath, config } = BaseController.resolveRegistry(fullPath);
    if (config.optOut) return { optOut: true };

    const bulk = BaseController.BULK_ROUTES[fullPath];
    if (bulk) return { config, bulk, kind: "bulk", entityType: bulk.entityType, category: bulk.category };

    const entityType = config.entityType || deriveEntityType(basePath);
    const category = config.category || entityType;
    const method = req.method;
    const relative = fullPath === basePath ? "/" : fullPath.slice(basePath.length);

    if (method === "POST" && relative === "/") {
      return { config, entityType, category, kind: "save", action: `${entityType}_saved` };
    }
    if (method === "DELETE" && !!req.params?.id && relative === "/:id") {
      return { config, entityType, category, kind: "delete", action: `${entityType}_deleted` };
    }
    return { config, entityType, category, kind: "generic", action: `${entityType}_${method.toLowerCase()}:${relative}` };
  }

  private async snapshot(dbModule: string, table: string, ids: string[], churchId: string): Promise<Map<string, any>> {
    const map = new Map<string, any>();
    if (!ids || ids.length === 0) return map;
    const rows = await KyselyPool.getDb<any>(dbModule).selectFrom(table as any).selectAll()
      .where("id", "in", ids).where("churchId", "=", churchId).execute();
    for (const r of rows as any[]) map.set(r.id, r);
    return map;
  }

  private extractBatchIds(req: express.Request, ctx: AuditContext): string[] {
    if (ctx.kind === "delete" || ctx.kind === "generic") return req.params?.id ? [req.params.id] : [];
    if (ctx.kind === "save") {
      const arr = Array.isArray(req.body) ? req.body : (req.body ? [req.body] : []);
      return arr.map((it: any) => it?.id).filter((id: any): id is string => typeof id === "string");
    }
    return [];
  }

  // Ensure repositories are hydrated per request without duplicating code in module controllers
  public actionWrapper(req: express.Request, res: express.Response, action: (au: AuthenticatedUser) => Promise<any>) {
    return super.actionWrapper(req, res, async (au) => {
      (this as any).repos = await this.getRepos<any>();

      const isMutation = MUTATING.has(req.method);
      const ctx = isMutation ? this.buildAuditContext(req) : null;

      const headerBatchId = (req.headers?.["x-batch-id"] as string) || undefined;
      let batchMode = false;
      let batchId: string | undefined;
      let beforeImages: Map<string, any> | undefined;
      let beforeImage: any; // normal-mode single delete before-image

      if (ctx && !ctx.optOut && au.churchId) {
        if (headerBatchId && ctx.kind !== "bulk") {
          // Explicit batch: strict. Validate ownership/state, require a batch-capable route, snapshot first.
          const membershipRepos = this.moduleName === "membership" ? (this as any).repos : await RepoManager.getRepos<any>("membership");
          const batch = await membershipRepos.batch.load(au.churchId, headerBatchId);
          if (!batch || batch.status !== "open" || batch.churchId !== au.churchId) return this.json({ error: "Invalid or closed batch" }, 403);
          if (!ctx.config?.dbModule || !ctx.config?.table) return this.json({ error: "Route is not batch-capable" }, 400);
          batchMode = true;
          batchId = headerBatchId;
          try {
            beforeImages = await this.snapshot(ctx.config.dbModule, ctx.config.table, this.extractBatchIds(req, ctx), au.churchId);
          } catch (e) {
            console.error("Batch snapshot failed:", e);
            return this.json({ error: "Snapshot read failed" }, 500);
          }
        } else if (ctx.kind === "bulk" && ctx.config?.dbModule && ctx.config?.table) {
          // Implicit bulk batch: best-effort before-images (never fail the request in normal mode).
          const ids = Array.isArray(req.body?.personIds) ? req.body.personIds : [];
          try { beforeImages = await this.snapshot(ctx.config.dbModule, ctx.config.table, ids, au.churchId); } catch (e) { console.error("Bulk snapshot failed:", e); }
        } else if (ctx.kind === "delete" && ctx.config?.dbModule && ctx.config?.table && req.params?.id) {
          try {
            beforeImage = await KyselyPool.getDb<any>(ctx.config.dbModule)
              .selectFrom(ctx.config.table as any).selectAll()
              .where("id", "=", req.params.id).where("churchId", "=", au.churchId)
              .executeTakeFirst();
          } catch (e) { console.error("Audit before-image load failed:", e); }
        }
      }

      const result = await action(au);

      if (ctx && !ctx.optOut) {
        const { statusCode, payload } = unwrapResult(result);
        if (statusCode < 400) {
          if (batchMode) {
            try { await this.writeBatchAuditRows(req, au, ctx, payload, beforeImages!, batchId!); } catch (e) { console.error("Batch audit failed:", e); }
          } else {
            // Only bulk endpoints carry an implicit-batch id in their payload; never read it for plain saves.
            const bulkBatchId = ctx.kind === "bulk" ? payload?.batchId : undefined;
            try { await this.writeAuditRows(req, au, ctx, payload, beforeImage, beforeImages, bulkBatchId); } catch (e) { console.error("Auto-audit failed:", e); }
          }
        }
      }

      // Return empty object instead of null for single entity queries
      return result === null ? {} : result;
    });
  }

  private async writeAuditRows(req: express.Request, au: AuthenticatedUser, ctx: AuditContext, payload: any, beforeImage: any, beforeImages?: Map<string, any>, batchId?: string) {
    if (!au.churchId) return;
    const { AuditLogHelper } = await import("../../modules/membership/helpers/AuditLogHelper.js");
    const repos = this.moduleName === "membership" ? (this as any).repos : await RepoManager.getRepos<any>("membership");
    const ip = AuditLogHelper.getClientIp(req);
    const userId = au.id || "anonymous";
    const promises: Promise<void>[] = [];
    const push = (action: string, entityId: string | undefined, details: object | undefined) =>
      promises.push(AuditLogHelper.log(repos, au.churchId, userId, ctx.category!, action, ctx.entityType, entityId, details, ip, this.moduleName, batchId));

    if (ctx.kind === "bulk" && ctx.bulk) {
      const ids = ctx.bulk.idsFrom(payload) || [];
      const after = ctx.bulk.afterFrom ? ctx.bulk.afterFrom(req) : undefined;
      for (const id of ids) {
        const before = beforeImages?.get(id) ?? null;
        // op always recorded: undo must never have to guess create-vs-update from a missing before-image.
        push(ctx.bulk.action, id, AuditLogHelper.capDetails({ op: ctx.bulk.op, before, after }));
      }
    } else if (ctx.kind === "delete") {
      push(ctx.action!, req.params?.id, beforeImage ? AuditLogHelper.capDetails({ before: beforeImage }) : undefined);
    } else if (ctx.kind === "save") {
      const items = Array.isArray(payload) ? payload : (payload?.id ? [payload] : []);
      const bodyArr = Array.isArray(req.body) ? req.body : [req.body];
      if (items.length > 0) {
        items.forEach((item: any, i: number) => {
          const after = bodyArr[i] ?? (Array.isArray(req.body) ? undefined : req.body);
          push(ctx.action!, item?.id, AuditLogHelper.capDetails({ after }));
        });
      } else {
        push(ctx.action!, undefined, AuditLogHelper.capDetails({ after: req.body }));
      }
    } else {
      push(ctx.action!, req.params?.id, AuditLogHelper.capDetails({ after: req.body }));
    }

    await Promise.allSettled(promises);
  }

  // Batch mode: one row per touched entity, tagged with batchId + before/after for undo.
  private async writeBatchAuditRows(req: express.Request, au: AuthenticatedUser, ctx: AuditContext, payload: any, beforeImages: Map<string, any>, batchId: string) {
    if (!au.churchId) return;
    const { AuditLogHelper } = await import("../../modules/membership/helpers/AuditLogHelper.js");
    const repos = this.moduleName === "membership" ? (this as any).repos : await RepoManager.getRepos<any>("membership");
    const ip = AuditLogHelper.getClientIp(req);
    const userId = au.id || "anonymous";
    const promises: Promise<void>[] = [];
    const push = (action: string, entityId: string | undefined, details: object | undefined) =>
      promises.push(AuditLogHelper.log(repos, au.churchId, userId, ctx.category!, action, ctx.entityType, entityId, details, ip, this.moduleName, batchId));

    if (ctx.kind === "delete") {
      const before = beforeImages.get(req.params?.id) ?? null;
      push(ctx.action!, req.params?.id, AuditLogHelper.capDetails({ op: "delete", before, after: null }));
    } else if (ctx.kind === "save") {
      const items = Array.isArray(payload) ? payload : (payload?.id ? [payload] : []);
      const bodyArr = Array.isArray(req.body) ? req.body : [req.body];
      items.forEach((item: any, i: number) => {
        const after = bodyArr[i] ?? (Array.isArray(req.body) ? undefined : req.body);
        const before = item?.id ? (beforeImages.get(item.id) ?? null) : null;
        // Absent from the pre-action snapshot = didn't exist before this batch.
        const op = item?.id && beforeImages.has(item.id) ? "update" : "create";
        push(ctx.action!, item?.id, AuditLogHelper.capDetails({ op, before, after }));
      });
    } else {
      const before = req.params?.id ? (beforeImages.get(req.params.id) ?? null) : null;
      const op = req.params?.id && beforeImages.has(req.params.id) ? "update" : "create";
      push(ctx.action!, req.params?.id, AuditLogHelper.capDetails({ op, before, after: req.body }));
    }

    await Promise.allSettled(promises);
  }

  public actionWrapperAnon(req: express.Request, res: express.Response, action: () => Promise<any>) {
    return super.actionWrapperAnon(req, res, async () => {
      (this as any).repos = await this.getRepos<any>();
      const result = await action();

      if (MUTATING.has(req.method)) {
        const fullPath = BaseController.fullRoutePath(req);
        const { config } = BaseController.resolveRegistry(fullPath);
        if (config?.sensitive && !config.optOut) {
          const { statusCode, payload } = unwrapResult(result);
          if (statusCode < 400) {
            try { await this.writeAnonAuditRow(req, config, payload); } catch (e) { console.error("Anon audit failed:", e); }
          }
        }
      }

      // Return empty object instead of null for single entity queries
      return result === null ? {} : result;
    });
  }

  private async writeAnonAuditRow(req: express.Request, config: AuditRouteConfig, payload: any) {
    const churchId = (req.body?.churchId || req.query?.churchId?.toString() || req.params?.churchId) as string | undefined;
    if (!churchId) return;
    const { AuditLogHelper } = await import("../../modules/membership/helpers/AuditLogHelper.js");
    const repos = this.moduleName === "membership" ? (this as any).repos : await RepoManager.getRepos<any>("membership");
    const ip = AuditLogHelper.getClientIp(req);
    const fullPath = BaseController.fullRoutePath(req);
    const { basePath } = BaseController.resolveRegistry(fullPath);
    const entityType = config.entityType || deriveEntityType(basePath);
    const category = config.category || entityType;
    const action = `${entityType}_${req.method.toLowerCase()}:${fullPath}`;
    const entityId = payload?.id || req.params?.id;
    await AuditLogHelper.log(repos, churchId, "anonymous", category, action, entityType, entityId, AuditLogHelper.capDetails({ after: req.body }), ip, this.moduleName);
  }
}
