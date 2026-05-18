import { Webhook, WebhookDelivery } from "../../modules/membership/models/index.js";
import { WebhookSigner } from "./WebhookSigner.js";
import { WebhookRetryPolicy } from "./WebhookRetryPolicy.js";
import { UrlValidator } from "./UrlValidator.js";

const REQUEST_TIMEOUT_MS = 10000;
const MAX_RESPONSE_BODY = 4000;

// Drains the durable webhook delivery outbox. Invoked on a short-interval
// timer. Each due delivery is POSTed once per run; failures are rescheduled
// per WebhookRetryPolicy until they succeed or exhaust their retries.
export class WebhookDeliveryWorker {
  public static async process(repos: any): Promise<{ attempted: number; succeeded: number; failed: number }> {
    const due: WebhookDelivery[] = await repos.webhookDelivery.loadDuePending(100);
    let succeeded = 0;
    let failed = 0;

    for (const delivery of due) {
      const webhook: Webhook = await repos.webhook.load(delivery.churchId, delivery.webhookId);
      if (!webhook || webhook.active === false) {
        delivery.status = "exhausted";
        delivery.nextAttemptAt = null;
        delivery.dateCompleted = new Date();
        await repos.webhookDelivery.update(delivery);
        continue;
      }
      const ok = await WebhookDeliveryWorker.attempt(repos, webhook, delivery);
      if (ok) succeeded++;
      else failed++;
    }

    return { attempted: due.length, succeeded, failed };
  }

  private static async attempt(repos: any, webhook: Webhook, delivery: WebhookDelivery): Promise<boolean> {
    delivery.attemptCount = (delivery.attemptCount ?? 0) + 1;
    let status = 0;
    let responseBody = "";

    try {
      if (await UrlValidator.resolvesToPrivate(new URL(webhook.url).hostname)) {
        responseBody = "Blocked: webhook URL resolves to a private address";
      } else {
        const signature = WebhookSigner.sign(webhook.secret, delivery.payload);
        const res = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "B1-Webhooks/1.0",
            "X-B1-Event": delivery.event,
            "X-B1-Delivery-Id": delivery.id,
            "X-B1-Signature": signature,
            "X-B1-Timestamp": Math.floor(Date.now() / 1000).toString()
          },
          body: delivery.payload,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
        status = res.status;
        responseBody = (await res.text()).slice(0, MAX_RESPONSE_BODY);
      }
    } catch (e: any) {
      responseBody = ("Request failed: " + (e?.message ?? String(e))).slice(0, MAX_RESPONSE_BODY);
    }

    const success = status >= 200 && status < 300;
    delivery.responseStatus = status || null;
    delivery.responseBody = responseBody;

    if (success) {
      delivery.status = "succeeded";
      delivery.nextAttemptAt = null;
      delivery.dateCompleted = new Date();
      await repos.webhook.resetFailures(webhook.churchId, webhook.id);
    } else {
      const next = WebhookRetryPolicy.nextAttemptAt(delivery.attemptCount);
      if (next) {
        delivery.status = "failed";
        delivery.nextAttemptAt = next;
      } else {
        delivery.status = "exhausted";
        delivery.nextAttemptAt = null;
        delivery.dateCompleted = new Date();
        await repos.webhook.recordExhaustion(webhook.churchId, webhook.id);
      }
    }

    await repos.webhookDelivery.update(delivery);
    return success;
  }
}
