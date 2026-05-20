import { controller, httpGet, httpPost, httpDelete, requestParam } from "inversify-express-utils";
import express from "express";
import { MembershipBaseController } from "./MembershipBaseController.js";
import { Permissions } from "../helpers/index.js";
import { Webhook } from "../models/index.js";
import { WEBHOOK_EVENTS, ALL_WEBHOOK_EVENTS, WebhookSigner, UrlValidator, WebhookDispatcher, WebhookDeliveryWorker, samplePayloadFor, formatForConnector } from "../../../shared/webhooks/index.js";

const CONNECTOR_TYPES = ["standard", "slack", "discord"];

@controller("/membership/webhooks")
export class WebhookController extends MembershipBaseController {
  // Public catalog of subscribable events — used by the admin UI event picker.
  @httpGet("/events")
  public async getEvents(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      return { groups: WEBHOOK_EVENTS, all: ALL_WEBHOOK_EVENTS };
    });
  }

  @httpGet("/deliveries/:deliveryId")
  public async getDelivery(@requestParam("deliveryId") deliveryId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const delivery = await this.repos.webhookDelivery.load(au.churchId, deliveryId);
      return delivery ?? this.json({ error: "Not found" }, 404);
    });
  }

  // Queues a fresh delivery attempt that reuses the original payload.
  @httpPost("/deliveries/:deliveryId/redeliver")
  public async redeliver(@requestParam("deliveryId") deliveryId: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const original = await this.repos.webhookDelivery.load(au.churchId, deliveryId);
      if (!original) return this.json({ error: "Not found" }, 404);
      return this.repos.webhookDelivery.create({
        churchId: au.churchId,
        webhookId: original.webhookId,
        event: original.event,
        payload: original.payload,
        status: "pending",
        attemptCount: 0
      });
    });
  }

  // Fires a synthetic sample payload at the webhook so an integrator can verify
  // connectivity and signature handling before real data flows. The delivery is
  // attempted synchronously and the result is returned for immediate feedback.
  @httpPost("/:id/test")
  public async test(@requestParam("id") id: string, req: express.Request<{}, {}, { event?: string }>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const webhook = await this.repos.webhook.load(au.churchId, id);
      if (!webhook) return this.json({ error: "Not found" }, 404);
      const requested = req.body?.event;
      const event = requested && webhook.events?.includes(requested) ? requested : webhook.events?.[0];
      if (!event) return this.json({ error: "Webhook has no subscribed events" }, 400);

      const envelope = { event, churchId: au.churchId, occurredAt: new Date().toISOString(), data: samplePayloadFor(event, au.churchId) };
      const payload = formatForConnector(webhook.connectorType, envelope);
      const delivery = await this.repos.webhookDelivery.create({ churchId: au.churchId, webhookId: webhook.id, event, payload, status: "pending", attemptCount: 0 });
      await WebhookDeliveryWorker.attempt(this.repos, webhook, delivery);
      return delivery;
    });
  }

  @httpGet("/:id/deliveries")
  public async getDeliveries(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      return this.repos.webhookDelivery.loadByWebhook(au.churchId, id, 50);
    });
  }

  @httpGet("/:id")
  public async get(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const webhook = await this.repos.webhook.load(au.churchId, id);
      return webhook ? this.maskSecret(webhook) : this.json({ error: "Not found" }, 404);
    });
  }

  @httpGet("/")
  public async getAll(req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const webhooks = await this.repos.webhook.loadAll(au.churchId);
      return webhooks.map((w) => this.maskSecret(w));
    });
  }

  // Creates or updates a webhook. The signing secret is generated on create and
  // returned exactly once in the create response; it is never returned again.
  @httpPost("/")
  public async save(req: express.Request<{}, {}, Webhook>, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const input = req.body;

      const events = Array.isArray(input.events) ? input.events : [];
      const invalid = events.filter((e) => !ALL_WEBHOOK_EVENTS.includes(e));
      if (invalid.length > 0) return this.json({ error: "Unknown event(s): " + invalid.join(", ") }, 400);
      if (events.length === 0) return this.json({ error: "At least one event is required" }, 400);

      const urlError = await UrlValidator.validate(input.url ?? "");
      if (urlError) return this.json({ error: urlError }, 400);

      const connectorType = input.connectorType ?? "standard";
      if (!CONNECTOR_TYPES.includes(connectorType)) return this.json({ error: "Unknown connector type: " + connectorType }, 400);

      let isNew = false;
      let webhook: Webhook;
      if (input.id) {
        webhook = await this.repos.webhook.load(au.churchId, input.id);
        if (!webhook) return this.json({ error: "Not found" }, 404);
      } else {
        isNew = true;
        webhook = { churchId: au.churchId, secret: WebhookSigner.generateSecret(), createdBy: au.id };
      }

      webhook.name = input.name;
      webhook.url = input.url;
      webhook.events = events;
      webhook.active = input.active !== false;
      webhook.connectorType = connectorType;

      const saved = await this.repos.webhook.save(webhook);
      WebhookDispatcher.invalidate(au.churchId);
      // Reveal the secret only on create — the church must store it now.
      return isNew ? saved : this.maskSecret(saved);
    });
  }

  // Rotates the signing secret and returns the new value once.
  @httpPost("/:id/regenerate-secret")
  public async regenerateSecret(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      const webhook = await this.repos.webhook.load(au.churchId, id);
      if (!webhook) return this.json({ error: "Not found" }, 404);
      webhook.secret = WebhookSigner.generateSecret();
      await this.repos.webhook.save(webhook);
      WebhookDispatcher.invalidate(au.churchId);
      return { id: webhook.id, secret: webhook.secret };
    });
  }

  @httpDelete("/:id")
  public async delete(@requestParam("id") id: string, req: express.Request, res: express.Response): Promise<any> {
    return this.actionWrapper(req, res, async (au) => {
      if (!au.checkAccess(Permissions.settings.edit)) return this.json({}, 401);
      await this.repos.webhook.delete(au.churchId, id);
      WebhookDispatcher.invalidate(au.churchId);
      return {};
    });
  }

  private maskSecret(webhook: Webhook): Webhook {
    const { secret: _secret, ...rest } = webhook;
    return { ...rest, secret: undefined };
  }
}
