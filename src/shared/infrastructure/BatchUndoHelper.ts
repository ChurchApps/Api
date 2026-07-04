import { KyselyPool } from "./KyselyPool.js";
import { BaseController } from "./BaseController.js";

export interface UndoResult {
  restored: number;
  skippedConflicts: Array<{ entityType?: string; entityId?: string }>;
  failed: Array<{ entityType?: string; entityId?: string; reason: string }>;
  status: "undone" | "partial";
}

interface ParsedRow {
  row: any;
  details: any;
  op?: "create" | "update" | "delete";
  truncated: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// JSON round-trips lose Date objects and drop nothing, but Kysely .set()/.values() silently
// drop `undefined` — so a cleared column would survive a restore. Force undefined -> null.
function reviveValue(v: any): any {
  if (v === undefined) return null;
  if (typeof v === "string" && ISO_DATE.test(v)) { const d = new Date(v); if (!isNaN(d.getTime())) return d; }
  return v;
}

function nullify(obj: any): any {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = reviveValue(v);
  return out;
}

async function restoreOrInsert(db: any, table: string, churchId: string, id: string, before: any) {
  const existing = await db.selectFrom(table).select("id").where("id", "=", id).where("churchId", "=", churchId).executeTakeFirst();
  const values = nullify(before);
  if (existing) await db.updateTable(table).set(values).where("id", "=", id).where("churchId", "=", churchId).execute();
  else await db.insertInto(table).values(values).execute();
}

// Only an explicit create marker (or a legacy _deleted/before signal) is trusted; a _saved row
// with no before-image and no marker must never be inferred as a create — that would hard-delete.
function rowOp(row: any, details: any): "create" | "update" | "delete" | undefined {
  if (details?.op === "create" || details?.op === "update" || details?.op === "delete") return details.op;
  if (typeof row.action === "string" && row.action.endsWith("_deleted")) return "delete";
  if (details?.before) return "update";
  return undefined;
}

export class BatchUndoHelper {
  // Groups the batch's audit rows per entity and reverses each entity ONCE to its pre-batch
  // state, skipping entities modified after the batch (conflict guard).
  public static async undo(membershipRepos: any, churchId: string, batch: any, undoUserId: string): Promise<UndoResult> {
    const rows = await membershipRepos.auditLog.loadForBatch(churchId, batch.id); // chronological asc
    const result: UndoResult = { restored: 0, skippedConflicts: [], failed: [], status: "undone" };
    const { AuditLogHelper } = await import("../../modules/membership/helpers/AuditLogHelper.js");

    const groups = new Map<string, ParsedRow[]>();
    const order: string[] = [];
    for (const row of rows) {
      if (!row.entityId) { result.failed.push({ entityType: row.entityType, entityId: row.entityId, reason: "no entityId" }); continue; }
      let details: any = {};
      try { details = row.details ? JSON.parse(row.details) : {}; } catch { /* treat as empty */ }
      const key = `${row.module}|${row.entityType}|${row.entityId}`;
      if (!groups.has(key)) { groups.set(key, []); order.push(key); }
      groups.get(key)!.push({ row, details, op: rowOp(row, details), truncated: !!details?.truncated });
    }

    for (const key of order.slice().reverse()) {
      const entries = groups.get(key)!;
      const latest = entries[entries.length - 1].row;
      const entityId: string = latest.entityId;

      const config = BaseController.resolveUndoConfig(latest.module, latest.entityType);
      if (!config || !config.dbModule || !config.table) { result.failed.push({ entityType: latest.entityType, entityId, reason: "not undoable" }); continue; }

      if (await membershipRepos.auditLog.hasLaterModification(churchId, latest.module, latest.entityType, entityId, latest.created, batch.id)) {
        result.skippedConflicts.push({ entityType: latest.entityType, entityId });
        continue;
      }

      const isCreate = entries.some((e) => e.op === "create");
      const hasDelete = entries.some((e) => e.op === "delete");
      const earliestBefore = entries.find((e) => e.details?.before)?.details.before ?? null;
      const latestAfter = entries.slice().reverse().find((e) => e.details?.after)?.details.after ?? null;
      const undoKind: "created" | "updated" | "deleted" = isCreate ? "created" : (hasDelete ? "deleted" : "updated");

      try {
        const db = KyselyPool.getDb<any>(config.dbModule);
        const table = config.table;
        // onUndo hooks may restore from `after` (e.g. groupMember natural key), so they run
        // before the generic before-image requirement.
        let handled = false;
        if (config.onUndo) handled = await config.onUndo({ db, membershipRepos, churchId, entityId, before: earliestBefore, after: latestAfter, undoKind });
        if (!handled) {
          if (undoKind === "created") {
            await db.deleteFrom(table as any).where("id", "=", entityId).where("churchId", "=", churchId).execute();
          } else if (earliestBefore) {
            // restoreOrInsert (not plain update) so update-then-hard-delete still restores.
            await restoreOrInsert(db, table, churchId, entityId, earliestBefore);
          } else {
            const reason = entries.some((e) => e.truncated) ? "truncated snapshot" : "no before-image";
            result.failed.push({ entityType: latest.entityType, entityId, reason });
            continue;
          }
        }
        await AuditLogHelper.log(membershipRepos, churchId, undoUserId, latest.category || latest.entityType, `${latest.entityType}_undone`, latest.entityType, entityId, { undoneFrom: batch.id }, undefined, latest.module);
        result.restored++;
      } catch (e) {
        result.failed.push({ entityType: latest.entityType, entityId, reason: String((e as any)?.message || e) });
      }
    }

    result.status = result.skippedConflicts.length === 0 && result.failed.length === 0 ? "undone" : "partial";
    return result;
  }
}
