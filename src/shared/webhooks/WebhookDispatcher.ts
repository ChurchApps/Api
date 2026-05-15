import { Webhook } from "../../modules/membership/models/index.js";

// In-process webhook event emitter. Called from controllers right after a
// mutation. emit() does a cached subscription lookup (so churches with no
// webhooks — the vast majority — cost zero queries on the write path) and,
// when there is a match, durably enqueues a delivery row. The actual HTTP
// delivery is handled separately by WebhookDeliveryWorker. emit() never
// throws — a webhook failure must never break the originating operation.
export class WebhookDispatcher {
  private static cache = new Map<string, { hooks: Webhook[]; expires: number }>();
  private static TTL_MS = 60000;

  public static invalidate(churchId: string): void {
    WebhookDispatcher.cache.delete(churchId);
  }

  public static async emit(repos: any, churchId: string, event: string, payload: any): Promise<void> {
    try {
      if (!churchId) return;
      const hooks = await WebhookDispatcher.getHooks(repos, churchId);
      if (hooks.length === 0) return;
      const matching = hooks.filter((h) => Array.isArray(h.events) && h.events.includes(event));
      if (matching.length === 0) return;

      const body = JSON.stringify({ event, churchId, occurredAt: new Date().toISOString(), data: payload });
      for (const hook of matching) {
        await repos.webhookDelivery.create({
          churchId,
          webhookId: hook.id,
          event,
          payload: body,
          status: "pending",
          attemptCount: 0
        });
      }
    } catch (e) {
      console.error("WebhookDispatcher.emit failed:", e);
    }
  }

  private static async getHooks(repos: any, churchId: string): Promise<Webhook[]> {
    const entry = WebhookDispatcher.cache.get(churchId);
    if (entry && entry.expires > Date.now()) return entry.hooks;
    const hooks: Webhook[] = await repos.webhook.loadActiveByChurch(churchId);
    WebhookDispatcher.cache.set(churchId, { hooks, expires: Date.now() + WebhookDispatcher.TTL_MS });
    return hooks;
  }
}
