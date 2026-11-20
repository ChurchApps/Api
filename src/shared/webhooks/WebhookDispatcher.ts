import { Webhook } from "../../modules/membership/models/index.js";
import { RepoManager } from "../infrastructure/RepoManager.js";
import { formatForConnector } from "./WebhookFormatters.js";
import { InternalEventBus } from "../events/InternalEventBus.js";
import type { Repos as MembershipRepos } from "../../modules/membership/repositories/index.js";

// Id fields a payload may carry, plus the names enrich() fills in from them.
interface EnrichablePayload {
  personId?: string;
  contentType?: string;
  contentId?: string;
  personName?: string;
  personEmail?: string;
  groupId?: string;
  groupName?: string;
  formId?: string;
  formName?: string;
  [key: string]: unknown;
}

// The lookups enrich() makes; the membership repos satisfy it.
export interface EnrichRepos {
  person: { load(churchId: string, id: string): Promise<{ displayName?: string; firstName?: string; lastName?: string; email?: string } | undefined> };
  group: { load(churchId: string, id: string): Promise<{ name?: string } | undefined> };
  form: { load(churchId: string, id: string): Promise<{ name?: string } | undefined> };
}

// emit() never throws — webhook failures must never break the originating operation.
export class WebhookDispatcher {
  private static cache = new Map<string, { hooks: Webhook[]; expires: number }>();
  private static TTL_MS = 60000;

  public static invalidate(churchId: string): void {
    WebhookDispatcher.cache.delete(churchId);
  }

  public static async emit(churchId: string, event: string, payload: unknown): Promise<void> {
    try {
      if (!churchId) return;
      await InternalEventBus.publish(churchId, event, payload);
      const repos = await RepoManager.getRepos<MembershipRepos>("membership");
      const hooks = await WebhookDispatcher.getHooks(repos, churchId);
      if (hooks.length === 0) return;
      const matching = hooks.filter((h) => Array.isArray(h.events) && h.events.includes(event));
      if (matching.length === 0) return;

      const data = await WebhookDispatcher.enrich(repos, churchId, event, payload);
      const envelope = { event, churchId, occurredAt: new Date().toISOString(), data };
      for (const hook of matching) {
        await repos.webhookDelivery.create({
          churchId,
          webhookId: hook.id,
          event,
          payload: formatForConnector(hook.connectorType, envelope),
          status: "pending",
          attemptCount: 0
        });
      }
    } catch (e) {
      console.error("WebhookDispatcher.emit failed:", e);
    }
  }

  // Payloads that only carry ids get human-readable names added. Runs only when a
  // matching subscription exists, so unsubscribed churches never pay the lookups.
  private static ENRICH: Record<string, { person?: boolean; group?: boolean; form?: boolean }> = {
    "group.member.added": { person: true, group: true },
    "group.member.removed": { person: true, group: true },
    "group.member.requested": { person: true, group: true },
    "attendance.recorded": { person: true },
    "attendance.checkout": { person: true },
    "session.created": { group: true },
    "donation.created": { person: true },
    "donation.updated": { person: true },
    "form.submission.created": { person: true, form: true },
    "list.member.added": { person: true },
    "list.member.removed": { person: true }
  };

  private static async enrich(repos: EnrichRepos, churchId: string, event: string, payload: unknown): Promise<unknown> {
    const wants = WebhookDispatcher.ENRICH[event];
    if (!wants || !payload || typeof payload !== "object") return payload;
    const out: EnrichablePayload = { ...(payload as EnrichablePayload) };
    try {
      const personId = out.personId || (out.contentType === "person" ? out.contentId : null);
      if (wants.person && personId && (!out.personName || !out.personEmail)) {
        const person = await repos.person.load(churchId, personId);
        if (person) {
          if (!out.personName) out.personName = person.displayName || [person.firstName, person.lastName].filter(Boolean).join(" ");
          if (!out.personEmail && person.email) out.personEmail = person.email;
        }
      }
      if (wants.group && out.groupId && !out.groupName) {
        const group = await repos.group.load(churchId, out.groupId);
        if (group) out.groupName = group.name;
      }
      if (wants.form && out.formId && !out.formName) {
        const form = await repos.form.load(churchId, out.formId);
        if (form) out.formName = form.name;
      }
    } catch (e) {
      console.error("WebhookDispatcher.enrich failed (delivering unenriched):", e);
    }
    return out;
  }

  private static async getHooks(repos: MembershipRepos, churchId: string): Promise<Webhook[]> {
    const entry = WebhookDispatcher.cache.get(churchId);
    if (entry && entry.expires > Date.now()) return entry.hooks;
    const hooks: Webhook[] = await repos.webhook.loadActiveByChurch(churchId);
    WebhookDispatcher.cache.set(churchId, { hooks, expires: Date.now() + WebhookDispatcher.TTL_MS });
    return hooks;
  }
}
