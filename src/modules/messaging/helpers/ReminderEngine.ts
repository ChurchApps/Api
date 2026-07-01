import crypto from "crypto";
import { Repos } from "../repositories/index.js";
import { ReminderDefinition, ReminderOccurrence } from "../models/index.js";
import { ReminderAdapterRegistry } from "./ReminderAdapter.js";
import { TimezoneHelper } from "./TimezoneHelper.js";
import { NotificationHelper } from "./NotificationHelper.js";
import { getMembershipModuleGateway } from "../../../shared/modules/MembershipModuleGateway.js";

const HORIZON_DAYS = 14;
const MAX_OFFSET_MIN = HORIZON_DAYS * 24 * 60;
const DEFAULT_TZ = "America/New_York";

// Generalized reminder engine (architecture §5). Reuses the automations
// scan-window/outbox pattern: the expander materializes per-occurrence fire rows;
// the dispatcher claims due rows and produces Notifications. Both ride existing
// timers — no new infra. Reminders are Notification *producers*; the preference
// gate inside NotificationHelper.createNotifications is the single send-time chokepoint.
export class ReminderEngine {
  private static repos: Repos;

  static init(repos: Repos) {
    ReminderEngine.repos = repos;
  }

  private static ensureInit() {
    if (!ReminderEngine.repos) throw new Error("ReminderEngine not initialized. Call ReminderEngine.init(repos) first.");
  }

  static parseOffsets(csv: string | null | undefined): number[] {
    const raw = csv === undefined || csv === null || csv === "" ? "1440" : csv;
    const offsets = raw.split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= MAX_OFFSET_MIN);
    return [...new Set(offsets)].sort((a, b) => a - b);
  }

  private static async churchTimeZone(churchId: string, cache?: Map<string, string>): Promise<string> {
    if (cache?.has(churchId)) return cache.get(churchId)!;
    let tz = DEFAULT_TZ;
    try {
      const church = await getMembershipModuleGateway().loadChurch(churchId);
      if (church?.timeZone) tz = church.timeZone;
    } catch { /* fall back to default */ }
    cache?.set(churchId, tz);
    return tz;
  }

  // Materialize fire rows for one definition over the rolling horizon. Idempotent
  // (occurrenceKey unique); safe to re-run. Called by the cron and synchronously
  // on definition save (so last-minute events still fire — §5.8).
  static async expandDefinition(def: ReminderDefinition, now: Date = new Date(), tzCache?: Map<string, string>): Promise<number> {
    this.ensureInit();
    if (!def.enabled || !def.entityId) return 0; // scope-based (entityId null) expansion deferred
    const adapter = ReminderAdapterRegistry.get(def.entityType || "");
    if (!adapter) return 0;
    const entity = await adapter.loadEntity(def.churchId!, def.entityId);
    if (!entity) return 0;

    const tz = def.timeZone || (await this.churchTimeZone(def.churchId!, tzCache));
    const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60000);
    const occurrences = await adapter.getOccurrences(entity, now, horizon);
    const offsets = this.parseOffsets(def.offsets);
    const sendLocalTime = def.sendLocalTime || "09:00:00";

    let written = 0;
    for (const occ of occurrences) {
      for (const offsetMin of offsets) {
        const fireAt = TimezoneHelper.computeFireAt(occ.startLocalDate, sendLocalTime, offsetMin, tz);
        if (fireAt.getTime() < now.getTime()) continue; // never fire a past occurrence
        await this.repos.reminderOccurrence.upsert({
          churchId: def.churchId,
          definitionId: def.id,
          entityType: def.entityType,
          entityId: def.entityId,
          category: def.category,
          message: def.message,
          occurrenceKey: `${def.id}:${occ.startLocalISO}:${offsetMin}`,
          occLocalISO: occ.startLocalISO,
          fireAt
        });
        written++;
      }
    }
    return written;
  }

  // Cron expander — rides the existing midnight timer.
  static async expandAll(now: Date = new Date()): Promise<number> {
    this.ensureInit();
    const defs = (await this.repos.reminderDefinition.loadAllEnabled()) as ReminderDefinition[];
    const tzCache = new Map<string, string>();
    let total = 0;
    for (const def of defs) {
      try {
        total += await this.expandDefinition(def, now, tzCache);
      } catch (e) {
        console.error(`[ReminderEngine] expand failed for definition ${def.id}:`, e);
      }
    }
    return total;
  }

  // Dispatcher — rides the existing 30-min timer. Claims due rows and produces
  // Notifications for not-yet-notified recipients (ledger-fenced for idempotency).
  static async scan(): Promise<{ processed: number; sent: number }> {
    this.ensureInit();
    const due = (await this.repos.reminderOccurrence.loadDue(100)) as ReminderOccurrence[];
    let processed = 0;
    let sent = 0;
    for (const occ of due) {
      if (!(await this.repos.reminderOccurrence.claim(occ.id!))) continue; // another worker won it
      processed++;
      try {
        const def = await this.repos.reminderDefinition.load(occ.churchId!, occ.definitionId!);
        if (!def || !(def as any).enabled) { await this.repos.reminderOccurrence.markCancelled(occ.id!); continue; }
        const adapter = ReminderAdapterRegistry.get(occ.entityType || "");
        if (!adapter) { await this.repos.reminderOccurrence.markCancelled(occ.id!); continue; }
        const entity = await adapter.loadEntity(occ.churchId!, occ.entityId!);
        if (!entity) { await this.repos.reminderOccurrence.markCancelled(occ.id!); continue; }

        const recipients = await adapter.loadRecipients(occ.churchId!, entity, occ.occLocalISO!, (def as any).recipientMode || "auto");
        const alreadySent = new Set(await this.repos.reminderSentLog.loadPersonIdsForOccurrence(occ.id!));
        const fresh = recipients.filter((r) => r.personId && !alreadySent.has(r.personId));

        if (fresh.length > 0) {
          const message = adapter.renderMessage ? adapter.renderMessage(entity, occ.occLocalISO!, occ.message || undefined) : (occ.message || "You have a reminder");
          const link = adapter.link(entity, occ.occLocalISO!) || undefined;
          await NotificationHelper.createNotifications(
            fresh.map((r) => r.personId),
            occ.churchId!,
            adapter.contentType,
            occ.entityId!,
            message,
            link,
            undefined,
            { category: occ.category, deliveryStartLevel: 1 }
          );
          await Promise.all(fresh.map((r) => this.repos.reminderSentLog.insertIgnore({
            churchId: occ.churchId,
            occurrenceId: occ.id,
            entityType: occ.entityType,
            entityId: occ.entityId,
            personId: r.personId,
            channel: "all",
            category: occ.category,
            status: "sent",
            // Key is source-namespaced by entityType (matches the serving writer's "plan:..." keys)
            // so the shared ledger's dedup fence can't collide across sources.
            idempotencyKey: crypto.createHash("sha256").update(`${occ.entityType}:${occ.id}:${r.personId}`).digest("hex")
          })));
          sent += fresh.length;
        }
        await this.repos.reminderOccurrence.markSent(occ.id!, recipients.length);
      } catch (e) {
        await this.repos.reminderOccurrence.markFailed(occ.id!, String((e as Error)?.message || e)); // lease re-surfaces next tick
      }
    }
    return { processed, sent };
  }

  static async cancelEntity(churchId: string, entityType: string, entityId: string): Promise<void> {
    this.ensureInit();
    await this.repos.reminderOccurrence.cancelPendingForEntity(churchId, entityType, entityId);
  }

  static async reExpandForEntity(churchId: string, entityType: string, entityId: string): Promise<void> {
    this.ensureInit();
    const defs = (await this.repos.reminderDefinition.loadForEntity(churchId, entityType, entityId)) as ReminderDefinition[];
    for (const def of defs) {
      await this.repos.reminderOccurrence.cancelPendingForDefinition(def.id!); // drop stale rows; expand re-creates current ones
      await this.expandDefinition(def);
    }
  }

  // InternalEventBus subscriber — content publishes event.created/updated/destroyed
  // via WebhookDispatcher; we keep occurrences in sync without waiting for midnight.
  // Bound at the subscription site (index.ts) so `this` resolves to the class.
  static async handleBusEvent(churchId: string, event: string, payload: any): Promise<void> {
    if (!this.repos || !event.startsWith("event.")) return;
    const eventId = payload?.id;
    if (!eventId) return;
    if (event === "event.destroyed") await this.cancelEntity(churchId, "event", eventId);
    else if (event === "event.created" || event === "event.updated") await this.reExpandForEntity(churchId, "event", eventId);
  }
}
