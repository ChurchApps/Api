import { ArrayHelper, EmailHelper } from "@churchapps/apihelper";
import { Conversation, DeliveryLog, Device, Message, PrivateMessage, Notification, NotificationPreference, NotificationPreferenceOverride } from "../models/index.js";
import { Repos } from "../repositories/index.js";
import { DeliveryHelper } from "./DeliveryHelper.js";
import { ExpoPushHelper } from "./ExpoPushHelper.js";
import { WebPushHelper } from "./WebPushHelper.js";
import { NotificationCategoryHelper } from "./NotificationCategoryHelper.js";
import { PreferenceGateHelper } from "./PreferenceGateHelper.js";
import axios from "axios";
import { Environment } from "../../../shared/helpers/Environment.js";

export interface NotificationDebugStep {
  step: string;
  status: "start" | "ok" | "warn" | "error";
  data?: Record<string, unknown>;
}

export interface NotificationDebugTrace {
  steps: NotificationDebugStep[];
}

export interface CreateNotificationOptions {
  deliveryStartLevel?: number;
  deliveryTitle?: string;
  navData?: Record<string, unknown>;
  category?: string; // preference opt-out axis (architecture §2.6); derived if omitted
  emailByPerson?: Record<string, { subject: string; html: string }>; // pre-rendered per-recipient email; only used when emailImmediate is set
  emailImmediate?: boolean; // send the rich email at creation time instead of the escalation/batch digest
}

export class NotificationHelper {
  private static repos: Repos;

  static init(repos: Repos) {
    NotificationHelper.repos = repos;
  }

  private static ensureInitialized() {
    if (!NotificationHelper.repos) {
      throw new Error("NotificationHelper not initialized. Call NotificationHelper.init(repos) first.");
    }
  }

  private static logDelivery = async (
    churchId: string,
    personId: string,
    contentType: string,
    contentId: string,
    deliveryMethod: string,
    success: boolean,
    deliveryAddress?: string,
    errorMessage?: string
  ) => {
    try {
      const log: DeliveryLog = {
        churchId,
        personId,
        contentType,
        contentId,
        deliveryMethod,
        success,
        deliveryAddress,
        errorMessage
      };
      await NotificationHelper.repos.deliveryLog.save(log);
    } catch (e) {
      console.error("Failed to log delivery attempt:", e);
    }
  };

  private static deleteInvalidToken = async (fcmToken: string) => {
    try {
      await NotificationHelper.repos.device.deleteByFcmToken(fcmToken);
      console.log(`Deleted invalid push token: ${fcmToken}`);
    } catch (e) {
      console.error("Failed to delete invalid token:", e);
    }
  };

  private static deviceSortTime = (device: Device): number => {
    const lastActive = device.lastActiveDate ? new Date(device.lastActiveDate).getTime() : 0;
    const registered = device.registrationDate ? new Date(device.registrationDate).getTime() : 0;
    return Math.max(lastActive, registered);
  };

  private static prepareWebPushDevices = (devices: Device[]): { activeTokens: string[]; staleTokens: string[]; activeDevices: Device[] } => {
    const byEndpoint = new Map<string, Device>();
    const staleTokens: string[] = [];

    for (const device of devices) {
      const token = device.fcmToken;
      if (!WebPushHelper.isWebPushToken(token)) continue;

      const endpoint = WebPushHelper.getEndpointFromToken(token);
      if (!endpoint) {
        staleTokens.push(token);
        continue;
      }

      const existing = byEndpoint.get(endpoint);
      if (!existing) {
        byEndpoint.set(endpoint, device);
        continue;
      }

      if (NotificationHelper.deviceSortTime(device) >= NotificationHelper.deviceSortTime(existing)) {
        if (existing.fcmToken) staleTokens.push(existing.fcmToken);
        byEndpoint.set(endpoint, device);
      } else {
        staleTokens.push(token);
      }
    }

    const activeDevices = Array.from(byEndpoint.values());
    return {
      activeDevices,
      activeTokens: activeDevices.map((device) => device.fcmToken).filter((token): token is string => !!token),
      staleTokens: [...new Set(staleTokens.filter(Boolean))]
    };
  };

  private static summarizePushDeviceForDebug = (device: Device): Record<string, unknown> => {
    const token = device.fcmToken || "";
    const isExpo = token.startsWith("ExponentPushToken[");
    const isWebPush = WebPushHelper.isWebPushToken(token);
    const endpoint = isWebPush ? WebPushHelper.getEndpointFromToken(token) : null;
    const endpointSummary = endpoint ? WebPushHelper.getEndpointSummary(endpoint) : {};

    return {
      id: device.id || null,
      appName: device.appName || null,
      tokenType: isExpo ? "expo" : (isWebPush ? "webpush" : (token ? "other" : "empty")),
      tokenLength: token.length,
      webPushCanDecodeEndpoint: isWebPush ? !!endpoint : undefined,
      endpointHost: endpointSummary.endpointHost || undefined,
      endpointFingerprint: endpointSummary.endpointFingerprint || undefined,
      likelyTruncated: isWebPush && !endpoint && token.length <= 255 ? true : undefined
    };
  };

  private static addDebugStep(trace: NotificationDebugTrace | undefined, step: string, status: NotificationDebugStep["status"], data?: Record<string, unknown>) {
    if (!trace) return;
    trace.steps.push({ step, status, ...(data ? { data } : {}) });
  }

  // Escalation levels: 0=socket, 1=push, 2=email
  static attemptDeliveryWithEscalation = async (
    churchId: string,
    personId: string,
    startLevel: number,
    title: string,
    body: string,
    contentType: string,
    contentId: string,
    navData?: Record<string, unknown>,
    category?: string,
    debugTrace?: NotificationDebugTrace
  ): Promise<string> => {
    this.ensureInitialized();
    const effectiveCategory = category ?? NotificationCategoryHelper.categoryFor(contentType, navData?.innerType as string | undefined);

    // Load prefs up-front: one pref read on hot path, reused by all gate levels.
    let pref = await NotificationHelper.repos.notificationPreference.loadByPersonId(churchId, personId);
    if (!pref) {
      pref = await this.createNotificationPref(churchId, personId);
    }
    // Skip mute query if no entity to mute, keeping delivery hot path lean.
    const needMutes = !!navData?.innerId;
    const [overrides, entityMutes] = (await Promise.all([
      NotificationHelper.repos.notificationPreferenceOverride.loadForPerson(churchId, personId),
      needMutes ? NotificationHelper.repos.notificationEntityMute.loadForPerson(churchId, personId) : Promise.resolve([])
    ])) as [NotificationPreferenceOverride[], any[]];
    const gateCtx = {
      pref,
      overrides: overrides || [],
      entityMutes: entityMutes || [],
      entityType: navData?.innerType as string | undefined,
      entityId: navData?.innerId as string | undefined
    };
    this.addDebugStep(debugTrace, "delivery-load-prefs", "ok", {
      allowPush: pref.allowPush,
      emailFrequency: pref.emailFrequency,
      category: effectiveCategory
    });

    // In-app/socket: muted items park (visible in inbox, no ping/badge/escalation). Socket success never stops here: always also evaluate push in the same pass (client SW suppresses the OS notification when the app is focused on that conversation).
    let socketDelivered = false;
    if (startLevel <= 0) {
      const inAppGate = PreferenceGateHelper.evaluate(churchId, personId, effectiveCategory, "in_app", gateCtx);
      if (!inAppGate.allow) {
        this.addDebugStep(debugTrace, "delivery-in-app-muted", "warn", { reason: inAppGate.reason, decision: inAppGate.decision });
        return "muted";
      }
      this.addDebugStep(debugTrace, "delivery-load-socket-connections", "start", { churchId, personId, contentType, contentId });
      const [connections, countsRaw] = await Promise.all([
        NotificationHelper.repos.connection.loadForNotification(churchId, personId),
        NotificationHelper.repos.notification.loadNewCounts(churchId, personId)
      ]);
      this.addDebugStep(debugTrace, "delivery-load-socket-connections", "ok", {
        connectionCount: connections.length,
        notificationCount: Number((countsRaw as any)?.notificationCount) || 0,
        pmCount: Number((countsRaw as any)?.pmCount) || 0
      });
      if (connections.length > 0) {
        const counts = {
          notificationCount: Number((countsRaw as any)?.notificationCount) || 0,
          pmCount: Number((countsRaw as any)?.pmCount) || 0
        };
        const deliveryCount = await DeliveryHelper.sendMessages(connections, {
          churchId,
          conversationId: contentType === "privateMessage"
            ? String(navData?.conversationId || "alert")
            : "alert",
          action: contentType === "privateMessage" ? "privateMessage" : "notification",
          data: { counts }
        });
        await Promise.all(connections.map((conn, index) => this.logDelivery(
          churchId,
          personId,
          contentType,
          contentId,
          "socket",
          index < deliveryCount,
          conn.socketId,
          index < deliveryCount ? undefined : "Socket delivery failed"
        )));
        socketDelivered = deliveryCount > 0;
        this.addDebugStep(debugTrace, "delivery-socket-send", deliveryCount > 0 ? "ok" : "warn", {
          attemptedConnectionCount: connections.length,
          deliveredCount: deliveryCount
        });
      }
    }

    if (startLevel <= 1) {
      const pushGate = PreferenceGateHelper.evaluate(churchId, personId, effectiveCategory, "push", gateCtx);
      if (!pushGate.allow) {
        this.addDebugStep(debugTrace, "delivery-push-gated", "warn", { reason: pushGate.reason, decision: pushGate.decision });
      }
      if (pushGate.allow) {
        const devices: Device[] = (await NotificationHelper.repos.device.loadForPerson(churchId, personId)) as any[];
        const allTokens = devices.map((device) => device.fcmToken).filter((token) => !!token) as string[];
        const expoPushTokens = [...new Set(allTokens.filter((token) => token.startsWith("ExponentPushToken[")))];
        const { activeTokens: webPushTokens, staleTokens: staleWebPushTokens, activeDevices: activeWebPushDevices } = this.prepareWebPushDevices(devices);
        const deviceTokenDebug = devices.map((device) => this.summarizePushDeviceForDebug(device));
        console.info("[chat-push] devices loaded", {
          churchId,
          personId,
          contentType,
          contentId,
          deviceCount: devices.length,
          deviceIds: devices.map((device) => device.id),
          expoPushCount: expoPushTokens.length,
          webPushCount: webPushTokens.length,
          staleWebPushCount: staleWebPushTokens.length,
          allowPush: pref.allowPush
        });
        this.addDebugStep(debugTrace, "delivery-load-devices", devices.length > 0 ? "ok" : "warn", {
          deviceCount: devices.length,
          deviceIds: devices.map((device) => device.id),
          expoPushCount: expoPushTokens.length,
          webPushCount: webPushTokens.length,
          staleWebPushCount: staleWebPushTokens.length,
          deviceTokenDebug
        });
        if (staleWebPushTokens.length > 0) {
          await Promise.all(staleWebPushTokens.map((token) => this.deleteInvalidToken(token)));
          this.addDebugStep(debugTrace, "delivery-delete-stale-webpush-tokens", "warn", { staleWebPushCount: staleWebPushTokens.length });
        }

        let anyPushSent = false;

        const badgeCountsRaw = await NotificationHelper.repos.notification.loadNewCounts(churchId, personId);
        const badgeCount = (Number((badgeCountsRaw as any)?.notificationCount) || 0) + (Number((badgeCountsRaw as any)?.pmCount) || 0);
        const pushNavData = { ...(navData || {}), badgeCount };

        if (expoPushTokens.length > 0) {
          try {
            const tickets = await ExpoPushHelper.sendBulkTypedMessages(expoPushTokens, title, body, contentType, contentId, pushNavData);
            await Promise.all(expoPushTokens.map((token, i) => {
              const ticket = tickets?.[i];
              const success = ticket?.status === "ok";
              const errorMsg = ticket?.status === "error" ? (ticket as any).message : undefined;
              const logPromise = this.logDelivery(churchId, personId, contentType, contentId, "push", success, token, errorMsg);
              if (!success && ticket?.status === "error") {
                return Promise.all([logPromise, this.deleteInvalidToken(token)]);
              }
              return logPromise;
            }));
            anyPushSent = true;
            this.addDebugStep(debugTrace, "delivery-expo-push", "ok", { expoPushCount: expoPushTokens.length });
          } catch (error) {
            console.error("Push notification failed:", error);
            this.addDebugStep(debugTrace, "delivery-expo-push", "error", { expoPushCount: expoPushTokens.length, error: String(error) });
            await Promise.all(expoPushTokens.map((token) => this.logDelivery(churchId, personId, contentType, contentId, "push", false, token, String(error))));
          }
        }

        if (webPushTokens.length > 0) {
          console.info("[webpush] preparing notification send", {
            ...WebPushHelper.getConfigSummary(),
            churchId,
            personId,
            contentType,
            contentId,
            deviceIds: activeWebPushDevices.map((device) => device.id),
            endpointHosts: [
              ...new Set(activeWebPushDevices.map((device) => WebPushHelper.getEndpointFromToken(device.fcmToken || "")).filter(Boolean).map((endpoint) => {
                try {
                  return new URL(endpoint).host;
                } catch {
                  return "unknown";
                }
              }))
            ],
            staleDuplicateCount: staleWebPushTokens.length
          });
          try {
            const results = await WebPushHelper.sendBulkTypedMessages(webPushTokens, title, body, contentType, contentId, pushNavData);
            const retryableFailures = results.filter((r) => !r.success && r.retryable);
            const nonRetryableFailures = results.filter((r) => !r.success && !r.retryable);
            this.addDebugStep(debugTrace, "delivery-webpush-send", results.some((r) => r.success) ? "ok" : (retryableFailures.length > 0 ? "warn" : "error"), {
              webPushCount: webPushTokens.length,
              successCount: results.filter((r) => r.success).length,
              retryableFailureCount: retryableFailures.length,
              nonRetryableFailureCount: nonRetryableFailures.length,
              failures: results.filter((r) => !r.success).map((r) => ({
                statusCode: r.statusCode,
                diagnosticCode: r.diagnosticCode,
                endpointHost: r.endpointHost
              }))
            });
            await Promise.all(results.map((r) => {
              const details = [r.diagnosticCode, r.statusCode, r.endpointHost, r.errorMessage].filter((value) => value !== undefined && value !== "").join(" | ");
              const logPromise = this.logDelivery(churchId, personId, contentType, contentId, "push", r.success, r.token, details || undefined);
              return r.gone ? Promise.all([logPromise, this.deleteInvalidToken(r.token)]) : logPromise;
            }));
            if (retryableFailures.length > 0) {
              console.warn("[webpush] retryable delivery failures detected", {
                churchId,
                personId,
                contentType,
                contentId,
                retryableCount: retryableFailures.length
              });
            }
            if (nonRetryableFailures.length > 0) {
              console.error("[webpush] non-retryable delivery failures detected", {
                churchId,
                personId,
                contentType,
                contentId,
                failureCount: nonRetryableFailures.length,
                diagnosticCodes: [...new Set(nonRetryableFailures.map((r) => r.diagnosticCode).filter(Boolean))]
              });
            }
            anyPushSent = anyPushSent || results.some((r) => r.success);
            console.info("[chat-push] web push send results", {
              churchId,
              personId,
              contentType,
              contentId,
              successCount: results.filter((r) => r.success).length,
              retryableFailureCount: retryableFailures.length,
              nonRetryableFailureCount: nonRetryableFailures.length,
              failures: nonRetryableFailures.concat(retryableFailures).map((r) => ({
                statusCode: r.statusCode,
                diagnosticCode: r.diagnosticCode,
                endpointHost: r.endpointHost,
                errorMessage: r.errorMessage
              }))
            });
            if (!anyPushSent && retryableFailures.length > 0) {
              this.addDebugStep(debugTrace, "delivery-return-push-retryable", "warn", { reason: "retryable webpush failures" });
              return "push";
            }
          } catch (error) {
            console.error("Web push notification failed:", error);
            this.addDebugStep(debugTrace, "delivery-webpush-send", "error", { webPushCount: webPushTokens.length, error: String(error) });
            await Promise.all(webPushTokens.map((token) => this.logDelivery(churchId, personId, contentType, contentId, "push", false, token, String(error))));
          }
        }

        if (anyPushSent) {
          this.addDebugStep(debugTrace, "delivery-return-push", "ok", { anyPushSent });
          return "push"; // Stop here, let 30-min timer escalate if unread
        }
      }
    }

    if (socketDelivered) {
      this.addDebugStep(debugTrace, "delivery-return-socket", "ok", { socketDelivered: true });
      return "socket";
    }

    // Email (gated): covers emailFrequency="never" and per-category opt-out; otherwise queued for digest path.
    const emailGate = PreferenceGateHelper.evaluate(churchId, personId, effectiveCategory, "email", gateCtx);
    if (!emailGate.allow) {
      this.addDebugStep(debugTrace, "delivery-return-complete", "warn", { reason: emailGate.reason || "email suppressed" });
      return "complete"; // End of line, no email wanted
    }
    this.addDebugStep(debugTrace, "delivery-return-email", "ok", { emailFrequency: pref.emailFrequency });
    return "email";
  };

  static escalateDelivery = async () => {
    this.ensureInitialized();
    console.log("[NotificationHelper.escalateDelivery] Starting escalation check...");

    // Load notifications pending escalation. Direct-message rows (contentType
    // "privateMessage") now escalate here too, as ordinary notification rows.
    const pendingNotifications: Notification[] = (await NotificationHelper.repos.notification.loadPendingEscalation()) as any[];
    console.log("[NotificationHelper.escalateDelivery] Found " + pendingNotifications.length + " notifications pending escalation");
    for (const notification of pendingNotifications) {
      const currentLevel = notification.deliveryMethod === "socket" ? 0 : 1;
      const nextLevel = currentLevel + 1;
      const isPm = notification.contentType === "privateMessage";

      let title = "New Notification";
      if (notification.message.includes("Volunteer Requests:")) {
        title = "New Plan Assignment";
      } else {
        title = notification.message;
      }

      // Keep the delivery keyed on contentType so the push carries the DM type and
      // the service worker deep-links to the conversation via the sender's personId.
      const newMethod = isPm
        ? await this.attemptDeliveryWithEscalation(
          notification.churchId,
          notification.personId,
          nextLevel,
          notification.message,
          notification.message,
          "privateMessage",
          notification.contentId,
          { personId: notification.triggeredByPersonId },
          notification.category
        )
        : await this.attemptDeliveryWithEscalation(
          notification.churchId,
          notification.personId,
          nextLevel,
          title,
          notification.message,
          "notification",
          notification.id,
          { innerType: notification.contentType, innerId: notification.contentId }
        );

      notification.deliveryMethod = newMethod;
      await NotificationHelper.repos.notification.save(notification);
      console.log("[NotificationHelper.escalateDelivery] Notification " + notification.id + " escalated from " + (currentLevel === 0 ? "socket" : "push") + " to " + newMethod);
    }

    console.log("[NotificationHelper.escalateDelivery] Escalation complete");
    return { notificationsEscalated: pendingNotifications.length };
  };

  static checkShouldNotify = async (conversation: Conversation, message: Message, senderPersonId: string, _title?: string, debugTrace?: NotificationDebugTrace) => {
    this.ensureInitialized();
    this.addDebugStep(debugTrace, "notify-start", "start", {
      churchId: conversation.churchId,
      conversationId: conversation.id,
      contentType: conversation.contentType,
      senderPersonId,
      messageId: message.id
    });
    switch (conversation.contentType) {
      case "streamingLive":
        this.addDebugStep(debugTrace, "notify-skip-streaming-live", "warn", { reason: "streaming live chat disabled for notifications" });
        break;
      case "privateMessage": {
        const pm: PrivateMessage = await NotificationHelper.repos.privateMessage.loadByConversationId(conversation.churchId, conversation.id);
        if (!pm) {
          this.addDebugStep(debugTrace, "notify-load-private-message-row", "error", {
            churchId: conversation.churchId,
            conversationId: conversation.id
          });
          console.warn("[chat-push] private message notification skipped: conversation mapping not found", {
            churchId: conversation.churchId,
            conversationId: conversation.id,
            senderPersonId
          });
          break;
        }
        this.addDebugStep(debugTrace, "notify-load-private-message-row", "ok", {
          privateMessageId: pm.id,
          fromPersonId: pm.fromPersonId,
          toPersonId: pm.toPersonId
        });

        const participants = [pm.fromPersonId, pm.toPersonId].filter((value): value is string => !!value);
        if (!senderPersonId || !participants.includes(senderPersonId)) {
          this.addDebugStep(debugTrace, "notify-validate-private-message-sender", "error", { senderPersonId, participants });
          console.warn("[chat-push] private message notification skipped: sender is not a conversation participant", { churchId: conversation.churchId, conversationId: conversation.id, senderPersonId, fromPersonId: pm.fromPersonId, toPersonId: pm.toPersonId, messageId: message.id });
          pm.notifyPersonId = null;
          await NotificationHelper.repos.privateMessage.save(pm);
          break;
        }
        this.addDebugStep(debugTrace, "notify-validate-private-message-sender", "ok", {
          senderPersonId,
          participants
        });

        pm.notifyPersonId = pm.fromPersonId === senderPersonId ? pm.toPersonId : pm.fromPersonId;
        const recipientDevices = pm.notifyPersonId
          ? await NotificationHelper.repos.device.loadForPerson(conversation.churchId, pm.notifyPersonId) as any[]
          : [];
        console.info("[chat-push] targets", {
          churchId: conversation.churchId,
          conversationId: conversation.id,
          senderPersonId,
          recipientPersonIds: pm.notifyPersonId ? [pm.notifyPersonId] : [],
          deviceCount: recipientDevices.length,
          deviceIds: recipientDevices.map((device) => device.id),
          contentType: conversation.contentType
        });
        if (!pm.notifyPersonId) {
          this.addDebugStep(debugTrace, "notify-resolve-private-message-recipient", "error", {
            fromPersonId: pm.fromPersonId,
            toPersonId: pm.toPersonId,
            senderPersonId
          });
          console.warn("[chat-push] private message notification skipped: recipient could not be resolved", {
            churchId: conversation.churchId,
            conversationId: conversation.id,
            senderPersonId,
            fromPersonId: pm.fromPersonId,
            toPersonId: pm.toPersonId,
            messageId: message.id
          });
          await NotificationHelper.repos.privateMessage.save(pm);
          break;
        }
        this.addDebugStep(debugTrace, "notify-resolve-private-message-recipient", "ok", {
          notifyPersonId: pm.notifyPersonId,
          recipientDeviceCount: recipientDevices.length,
          recipientDeviceIds: recipientDevices.map((device) => device.id)
        });

        // Persist notifyPersonId first so unread count query includes this new message.
        await NotificationHelper.repos.privateMessage.save(pm);
        this.addDebugStep(debugTrace, "notify-save-private-message-target", "ok", {
          privateMessageId: pm.id,
          notifyPersonId: pm.notifyPersonId
        });

        // Notifications row owns delivery state/escalation. Reuse existing unread row so consecutive messages share one escalation unit; every message pings socket.
        const existingDmRows = (await NotificationHelper.repos.notification.loadExistingUnread(conversation.churchId, "privateMessage", pm.id)) as any[] || [];
        let dmNotification: Notification = (existingDmRows || []).find((n: any) => n.personId === pm.notifyPersonId);
        if (!dmNotification) {
          dmNotification = await NotificationHelper.repos.notification.save({
            churchId: conversation.churchId,
            personId: pm.notifyPersonId,
            contentType: "privateMessage",
            contentId: pm.id,
            timeSent: new Date(),
            isNew: true,
            message: `New Message from ${message.displayName}`,
            triggeredByPersonId: senderPersonId,
            category: "direct_messages"
          });
        }

        // Start at level 0 (socket). navData.personId = the OTHER party (sender) so SW deep-links to /mobile/messages/{senderPersonId}.
        const deliveryMethod = await this.attemptDeliveryWithEscalation(
          message.churchId,
          pm.notifyPersonId,
          0, // Start at socket level
          `New Message from ${message.displayName}`,
          message.content,
          "privateMessage",
          pm.id || conversation.id,
          { personId: senderPersonId, conversationId: conversation.id },
          undefined, // category derived from contentType ("privateMessage" -> direct_messages)
          debugTrace
        );

        dmNotification.deliveryMethod = deliveryMethod;
        if (deliveryMethod === "muted") {
          dmNotification.isNew = false;
          pm.notifyPersonId = null;
          await NotificationHelper.repos.privateMessage.save(pm);
        }
        await NotificationHelper.repos.notification.save(dmNotification);
        this.addDebugStep(debugTrace, "notify-save-private-message-delivery-method", "ok", {
          privateMessageId: pm.id,
          notificationId: dmNotification.id,
          deliveryMethod
        });
        break;
      }
      default: {
        const allMessages: Message[] = await NotificationHelper.repos.message.loadForConversation(conversation.churchId, conversation.id);
        // Subscription model: latest action per person wins (real comment auto-subscribes; subscription marker toggles state). Iterate chronologically.
        const sorted = [...allMessages].sort((a, b) => {
          const ta = a.timeSent ? new Date(a.timeSent).getTime() : 0;
          const tb = b.timeSent ? new Date(b.timeSent).getTime() : 0;
          return ta - tb;
        });
        const stateByPerson = new Map<string, boolean>();
        sorted.forEach((m) => {
          if (!m.personId) return;
          if (m.messageType === "subscription") {
            stateByPerson.set(m.personId, m.content !== "off");
          } else {
            stateByPerson.set(m.personId, true);
          }
        });
        const subscribers = Array.from(stateByPerson.entries())
          .filter(([, subscribed]) => subscribed)
          .map(([personId]) => personId)
          .filter((pid) => pid !== senderPersonId);
        const recipientDevices = subscribers.length > 0
          ? ((await Promise.all(subscribers.map((personId) => NotificationHelper.repos.device.loadForPerson(conversation.churchId, personId)))) as any[][]).flat()
          : [];
        console.info("[chat-push] targets", {
          churchId: conversation.churchId,
          conversationId: conversation.id,
          senderPersonId,
          recipientPersonIds: subscribers,
          deviceCount: recipientDevices.length,
          deviceIds: recipientDevices.map((device) => device.id),
          contentType: conversation.contentType
        });
        if (subscribers.length > 0) {
          await this.createNotifications(subscribers, conversation.churchId, conversation.contentType, conversation.contentId, "New message: " + conversation.title, undefined, senderPersonId);
        }
        break;
      }
    }
  };

  static createNotifications = async (peopleIds: string[], churchId: string, contentType: string, contentId: string, message: string, link?: string, triggeredByPersonId?: string, options?: CreateNotificationOptions) => {
    this.ensureInitialized();
    const category = options?.category ?? NotificationCategoryHelper.categoryFor(contentType);
    const notifications: Notification[] = [];
    peopleIds.forEach((personId: string) => {
      const notification: Notification = {
        churchId,
        personId,
        contentType,
        contentId,
        timeSent: new Date(),
        isNew: true,
        message,
        link,
        triggeredByPersonId,
        category
      };
      notifications.push(notification);
    });

    if (notifications.length === 0) return [];

    // Don't re-notify same event, except emailImmediate (reminders, staff "email all", workflow steps) where producers own dedup (ledger/intent).
    if (!options?.emailImmediate) {
      const existing = (await NotificationHelper.repos.notification.loadExistingUnread(notifications[0].churchId, notifications[0].contentType, notifications[0].contentId)) as any[] || [];
      const suppressedPersonIds: string[] = [];
      for (let i = notifications.length - 1; i >= 0; i--) {
        if (existing.length > 0 && ArrayHelper.getAll(existing, "personId", notifications[i].personId).length > 0) {
          suppressedPersonIds.push(notifications[i].personId);
          notifications.splice(i, 1);
        }
      }
      if (suppressedPersonIds.length > 0) {
        console.info("[chat-push] notification suppressed by unread existing", {
          churchId,
          contentType,
          contentId,
          suppressedPersonIds
        });
      }
    }
    if (notifications.length > 0) {
      const emailAddresses = new Map<string, string>();
      if (options?.emailImmediate) {
        const emailData = (await this.getEmailData(notifications.map((n) => ({ personId: n.personId }) as NotificationPreference))) || [];
        emailData.forEach((e: any) => { if (e?.id && e?.email) emailAddresses.set(e.id, e.email); });
      }

      const promises: Promise<Notification>[] = [];
      notifications.forEach((n) => {
        const promise = NotificationHelper.repos.notification.save(n).then(async (notification) => {
          // Use escalation logic - start at level 0 (socket)
          let title = "New Notification";
          if (n.message.includes("Volunteer Requests:")) {
            title = "New Plan Assignment";
          } else if (n.message.startsWith("New message:")) {
            title = n.message;
          } else {
            title = n.message;
          }

          // Forward content type/id so SW deep-links to actual conversation/group instead of notifications list.
          const deliveryMethod = await NotificationHelper.attemptDeliveryWithEscalation(
            n.churchId,
            n.personId,
            options?.deliveryStartLevel ?? 0,
            options?.deliveryTitle || title,
            n.message,
            "notification",
            notification.id,
            { innerType: n.contentType, innerId: n.contentId, ...(n.link ? { link: n.link } : {}), ...(options?.navData || {}) },
            n.category
          );

          notification.deliveryMethod = deliveryMethod;
          // Muted rows parked: isNew=false keeps out of badge counts and stops escalation.
          if (deliveryMethod === "muted") notification.isNew = false;
          await NotificationHelper.repos.notification.save(notification);

          if (options?.emailImmediate) {
            await NotificationHelper.applyImmediateEmail(notification, emailAddresses.get(n.personId), options);
          }

          return notification;
        });
        promises.push(promise);
      });
      const result = await Promise.all(promises);
      return result;
    } else return [];
  };

  // Post-escalation rich email (gated, immediate instead of digest). No address leaves row as escalation left it.
  private static applyImmediateEmail = async (notification: Notification, email: string | undefined, options: CreateNotificationOptions) => {
    if (!email) return;

    const pref = await NotificationHelper.repos.notificationPreference.loadByPersonId(notification.churchId, notification.personId);
    const overrides = (await NotificationHelper.repos.notificationPreferenceOverride.loadForPerson(notification.churchId, notification.personId)) as any[] || [];
    const gate = PreferenceGateHelper.evaluate(notification.churchId, notification.personId, notification.category || "", "email", { pref, overrides });

    if (!gate.allow) {
      notification.deliveryMethod = "complete";
      await NotificationHelper.repos.notification.save(notification);
      return;
    }

    const custom = options.emailByPerson?.[notification.personId];
    const subject = custom?.subject || options.deliveryTitle || notification.message;
    const html = custom?.html || (notification.message + (notification.link ? ` <a href="${notification.link}">View Details</a>` : ""));

    try {
      await EmailHelper.sendTemplatedEmail("support@churchapps.org", email, "B1.church", "https://admin.b1.church", subject, html, "ChurchEmailTemplate.html");
      await this.logDelivery(notification.churchId, notification.personId, "notification", notification.id, "email", true, email);
      notification.deliveryMethod = "complete";
      await NotificationHelper.repos.notification.save(notification);
    } catch (e) {
      await this.logDelivery(notification.churchId, notification.personId, "notification", notification.id, "email", false, email, String(e));
    }
  };

  // Legacy push paths (§4.5) route through gate so opt-outs/master-mute/quiet-hours honored.
  private static pushAllowed = async (churchId: string, personId: string, category: string): Promise<boolean> => {
    const pref = await NotificationHelper.repos.notificationPreference.loadByPersonId(churchId, personId);
    const overrides = (await NotificationHelper.repos.notificationPreferenceOverride.loadForPerson(churchId, personId)) as any[] || [];
    return PreferenceGateHelper.evaluate(churchId, personId, category, "push", { pref, overrides }).allow;
  };

  static notifyUser = async (churchId: string, personId: string, title: string = "New Notification") => {
    this.ensureInitialized();
    let method = "";
    const _deliveryCount = 0;

    const connections = await NotificationHelper.repos.connection.loadForNotification(churchId, personId);
    if (connections.length > 0) {
      const deliveryCount = await DeliveryHelper.sendMessages(connections, {
        churchId,
        conversationId: "alert",
        action: "notification",
        data: {}
      });
      if (deliveryCount > 0) method = "socket";
    }

    const devices: Device[] = (await NotificationHelper.repos.device.loadForPerson(churchId, personId)) as any[];

    const allowPush = await this.pushAllowed(churchId, personId, NotificationCategoryHelper.categoryFor("notification"));
    if (devices.length > 0 && allowPush) {
      try {
        const allTokens = devices.map((device) => device.fcmToken).filter((token) => !!token) as string[];
        const expoPushTokens = [...new Set(allTokens.filter((token) => token.startsWith("ExponentPushToken[")))];
        const { activeTokens: webPushTokens, staleTokens: staleWebPushTokens } = this.prepareWebPushDevices(devices);
        if (staleWebPushTokens.length > 0) {
          await Promise.all(staleWebPushTokens.map((token) => this.deleteInvalidToken(token)));
        }

        if (expoPushTokens.length > 0) {
          await ExpoPushHelper.sendBulkMessages(expoPushTokens, title, title);
          method = "push";
        }

        if (webPushTokens.length > 0) {
          const results = await WebPushHelper.sendBulkMessages(webPushTokens, title, title);
          for (const r of results) {
            if (r.gone) await this.deleteInvalidToken(r.token);
          }
          const retryableFailures = results.filter((r) => !r.success && r.retryable);
          if (retryableFailures.length > 0) {
            console.warn("[webpush] notifyUser retryable failures", {
              churchId,
              personId,
              retryableCount: retryableFailures.length
            });
          }
          if (results.some((r) => r.success)) method = "push";
          else if (retryableFailures.length > 0) method = "push";
        }
      } catch (error) {
        // Log the error but don't throw - we still want to return the method if socket delivery worked
        console.error("Push notification failed for notifyUser:", error);
      }
    }

    return method;
  };

  static sendEmailNotifications = async (frequency: string) => {
    const startTime = Date.now();
    console.log("[NotificationHelper.sendEmailNotifications] ========== START ==========");
    console.log("[NotificationHelper.sendEmailNotifications] Frequency: " + frequency + ", Timestamp: " + new Date().toISOString());

    this.ensureInitialized();
    console.log("[NotificationHelper.sendEmailNotifications] Repos initialized check passed (" + (Date.now() - startTime) + "ms)");

    let promises: Promise<any>[] = [];

    // DMs now flow as notification rows (contentType "privateMessage"); no separate PM escalation queue.
    const rawNotifications = await NotificationHelper.repos.notification.loadUndelivered();
    const allNotifications: Notification[] = (rawNotifications || []) as any[];
    console.log("[NotificationHelper.sendEmailNotifications] Found " + allNotifications.length + " undelivered notifications");

    if (allNotifications.length === 0) {
      console.log("[NotificationHelper.sendEmailNotifications] No undelivered items found, returning early");
      return;
    }

    const peopleIds = ArrayHelper.getIds(allNotifications, "personId");
    console.log("[NotificationHelper.sendEmailNotifications] Processing " + peopleIds.length + " unique people");

    const notificationPrefs = (await NotificationHelper.repos.notificationPreference.loadByPersonIds(peopleIds)) as any[];

    const todoPrefs: NotificationPreference[] = [];
    for (const personId of peopleIds) {
      const notifications: Notification[] = ArrayHelper.getAll(allNotifications, "personId", personId);
      let pref = ArrayHelper.getOne(notificationPrefs, "personId", personId);
      if (!pref) {
        pref = await this.createNotificationPref(notifications[0]?.churchId, personId);
      }
      if (pref.emailFrequency === "never") {
        promises = promises.concat(this.markMethod(notifications, "complete"));
      } else if (pref.emailFrequency === frequency) {
        todoPrefs.push(pref);
      }
      // else: leave for the other timer (don't mark as "none")
    }

    console.log("[NotificationHelper.sendEmailNotifications] " + todoPrefs.length + " people to process for '" + frequency + "' frequency");

    if (todoPrefs.length > 0) {
      const allEmailData = await this.getEmailData(todoPrefs);

      // Reply-to: the person who triggered each notification (DM sender, task
      // assigner, etc.) is carried on triggeredByPersonId.
      const triggerIds = [...new Set(allNotifications.map((n) => n.triggeredByPersonId).filter((id): id is string => !!id))];
      let triggerEmailData: any[] = [];
      if (triggerIds.length > 0) {
        const triggerPrefs = triggerIds.map((personId) => ({ personId } as NotificationPreference));
        triggerEmailData = await this.getEmailData(triggerPrefs);
      }

      // Batch-load every recipient's overrides once (mirrors the batched pref load above).
      const allOverrides = (await NotificationHelper.repos.notificationPreferenceOverride.loadByPersonIds(ArrayHelper.getIds(todoPrefs, "personId"))) as any[] || [];

      for (const pref of todoPrefs) {
        const allPersonNotifs: Notification[] = ArrayHelper.getAll(allNotifications, "personId", pref.personId);
        const emailData = ArrayHelper.getOne(allEmailData, "id", pref.personId);

        // Re-check preference gate per category; opted-out items marked complete (not emailed/re-queued).
        const overrides = ArrayHelper.getAll(allOverrides, "personId", pref.personId);
        const emailOk = (category: string) => PreferenceGateHelper.evaluate(pref.churchId, pref.personId, category, "email", { pref, overrides }).allow;
        const notifications = allPersonNotifs.filter((n) => emailOk(n.category || NotificationCategoryHelper.categoryFor(n.contentType)));
        const suppressedNotifs = allPersonNotifs.filter((n) => !notifications.includes(n));
        if (suppressedNotifs.length > 0) {
          promises.push(...this.markMethod(suppressedNotifs, "complete"));
        }

        // Reply-to = the trigger/sender of first item.
        let senderEmail: string | undefined;
        if (notifications.length > 0 && notifications[0].triggeredByPersonId) {
          const triggerData = ArrayHelper.getOne(triggerEmailData, "id", notifications[0].triggeredByPersonId);
          senderEmail = triggerData?.email;
        }

        console.log("[NotificationHelper.sendEmailNotifications] Person " + pref.personId + ": email=" + (emailData?.email || "NOT FOUND") + ", notifications=" + notifications.length + ", replyTo=" + (senderEmail || "none"));
        if (emailData?.email && notifications.length > 0) {
          promises.push(this.sendEmailNotification(emailData.email, notifications, senderEmail));
        }
      }
    }
    await Promise.all(promises);
    console.log("[NotificationHelper.sendEmailNotifications] ========== COMPLETE ==========");
    console.log("[NotificationHelper.sendEmailNotifications] Total execution time: " + (Date.now() - startTime) + "ms");
    return { frequency, notificationsProcessed: allNotifications.length, emailsSent: promises.length };
  };

  static markMethod = (notifications: Notification[], method: string) => {
    const promises: Promise<any>[] = [];
    notifications.forEach((notification) => {
      notification.deliveryMethod = method;
      promises.push(NotificationHelper.repos.notification.save(notification));
    });
    return promises;
  };

  static createNotificationPref = async (churchId: string, personId: string) => {
    const pref: NotificationPreference = {
      churchId,
      personId,
      allowPush: true,
      emailFrequency: "daily"
    };
    const result = await NotificationHelper.repos.notificationPreference.save(pref);
    return result;
  };

  static getEmailData = async (notificationPrefs: NotificationPreference[]) => {
    const peopleIds = ArrayHelper.getIds(notificationPrefs, "personId");
    console.log("[NotificationHelper.getEmailData] Fetching emails for " + peopleIds.length + " people");
    console.log("[NotificationHelper.getEmailData] PeopleIds: " + JSON.stringify(peopleIds));
    const data = { peopleIds, jwtSecret: Environment.jwtSecret };
    const url = Environment.membershipApi + "/people/apiEmails";
    console.log("[NotificationHelper.getEmailData] Calling API: " + url);
    try {
      const result = await axios.post(url, data);
      console.log("[NotificationHelper.getEmailData] API response status: " + result.status);
      console.log("[NotificationHelper.getEmailData] API response data: " + JSON.stringify(result.data));
      return result.data;
    } catch (error: any) {
      console.error("[NotificationHelper.getEmailData] API call FAILED:", error.message);
      console.error("[NotificationHelper.getEmailData] Error response:", error.response?.data);
      throw error;
    }
  };

  static sendEmailNotification = async (email: string, notifications: Notification[], senderEmail?: string) => {
    if (!email || typeof email !== "string" || !email.includes("@")) {
      console.error("[NotificationHelper.sendEmailNotification] Invalid email address: " + email + ", skipping send");
      return;
    }

    const notifCount = notifications?.length || 0;
    if (notifCount === 0) return;

    const firstNotification = notifications[0];
    const allDms = notifications.every((n) => n.contentType === "privateMessage");
    let title = "";
    let content = "";

    if (notifCount === 1) {
      if (firstNotification.contentType === "privateMessage") {
        // DM digest — the row message already reads "New Message from {name}".
        title = firstNotification.message;
        content = firstNotification.message;
      } else if (firstNotification.message.includes("Volunteer Requests:")) {
        const match = firstNotification.message.match(/Volunteer Requests:(.*).Please log in and confirm/);
        title = "New Notification: Volunteer Request";
        content = "<h3>New Notification</h3><h4>Volunteer Request</h4><h4>" + (match ? match[1] : firstNotification.message) + "</h4>" +
          (firstNotification.link
            ? "<a href='" + firstNotification.link + "' target='_blank'><button style='background-color: #0288d1; border:2px solid #0288d1; border-radius: 5px; color:white; cursor: pointer; padding: 5px'>View Details</button></a>"
            : "") +
          "<p>Please log in and confirm</p>";
      } else {
        title = "New Notification: " + firstNotification.message;
        content = "New Notification: " + firstNotification.message;
      }
    } else {
      title = notifCount + (allDms ? " New Message" : " New Notification") + "s";
    }

    const replyTo = senderEmail || undefined;

    let emailSuccess = true;
    let emailError: string | undefined;
    try {
      await EmailHelper.sendTemplatedEmail("support@churchapps.org", email, "B1.church", "https://admin.b1.church", title, content, "ChurchEmailTemplate.html", replyTo);
      console.log("[NotificationHelper.sendEmailNotification] Email sent successfully to " + email);
    } catch (error) {
      emailSuccess = false;
      emailError = String(error);
      console.error("[NotificationHelper.sendEmailNotification] Email FAILED to " + email + ":", error);
    }

    for (const notification of notifications) {
      const logType = notification.contentType === "privateMessage" ? "privateMessage" : "notification";
      await this.logDelivery(notification.churchId, notification.personId, logType, notification.id, "email", emailSuccess, email, emailError);
    }

    if (emailSuccess) {
      await Promise.all(this.markMethod(notifications, "complete"));
    } else {
      console.log("[NotificationHelper.sendEmailNotification] Email failed, NOT marking items as delivered");
    }
  };
}
