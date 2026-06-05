import { ArrayHelper, EmailHelper } from "@churchapps/apihelper";
import { Conversation, DeliveryLog, Device, Message, PrivateMessage, Notification, NotificationPreference } from "../models/index.js";
import { Repos } from "../repositories/index.js";
import { DeliveryHelper } from "./DeliveryHelper.js";
import { ExpoPushHelper } from "./ExpoPushHelper.js";
import { WebPushHelper } from "./WebPushHelper.js";
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
    debugTrace?: NotificationDebugTrace
  ): Promise<string> => {
    this.ensureInitialized();
    // const isPrivateMessage = contentType === "privateMessage";
    // const senderPersonId = isPrivateMessage ? String(navData?.personId || "") : "";
    // const conversationId = isPrivateMessage ? String(navData?.conversationId || "") : "";

    // Level 0: Try Socket. Load connections and unread counts in parallel so the
    // socket payload can carry the fresh counts and the client avoids a round-trip.
    // For private messages, do not stop at socket delivery. Installed PWAs can
    // keep an alerts socket alive in the background, which would otherwise
    // suppress the OS-level push notification entirely.
    let socketDelivered = false;
    if (startLevel <= 0) {
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
        if (contentType !== "privateMessage" && deliveryCount > 0) {
          this.addDebugStep(debugTrace, "delivery-stop-at-socket", "ok", { reason: "non-private-message socket delivery succeeded" });
          return "socket"; // Stop here, let 15-min timer escalate if unread
        }
      }
    }

    // Only load prefs when we may need them (push/email fallback).
    let pref = await NotificationHelper.repos.notificationPreference.loadByPersonId(churchId, personId);
    if (!pref) {
      pref = await this.createNotificationPref(churchId, personId);
    }
    this.addDebugStep(debugTrace, "delivery-load-prefs", "ok", {
      allowPush: pref.allowPush,
      emailFrequency: pref.emailFrequency
    });

    // Level 1: Try Push
    if (startLevel <= 1) {
      if (pref.allowPush) {
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
          return "push"; // Stop here, let 15-min timer escalate if unread
        }
      }
    }

    if (socketDelivered) {
      this.addDebugStep(debugTrace, "delivery-return-socket", "ok", { socketDelivered: true });
      return "socket";
    }

    // Level 2: Email
    if (pref.emailFrequency === "never") {
      this.addDebugStep(debugTrace, "delivery-return-complete", "warn", { reason: "email frequency set to never" });
      return "complete"; // End of line, no email wanted
    } else if (pref.emailFrequency === "individual") {
      // Send email immediately - the sendEmailNotifications will handle this
      // For now, mark as "email" to indicate it's ready for immediate send
      this.addDebugStep(debugTrace, "delivery-return-email", "ok", { emailFrequency: pref.emailFrequency });
      return "email";
    } else {
      // daily - wait for midnight timer
      this.addDebugStep(debugTrace, "delivery-return-email", "ok", { emailFrequency: pref.emailFrequency });
      return "email";
    }
  };

  static escalateDelivery = async () => {
    this.ensureInitialized();
    console.log("[NotificationHelper.escalateDelivery] Starting escalation check...");

    // Load notifications pending escalation
    const pendingNotifications: Notification[] = (await NotificationHelper.repos.notification.loadPendingEscalation()) as any[];
    console.log("[NotificationHelper.escalateDelivery] Found " + pendingNotifications.length + " notifications pending escalation");

    // Load private messages pending escalation
    const pendingPMs: PrivateMessage[] = (await NotificationHelper.repos.privateMessage.loadPendingEscalation()) as any[];
    console.log("[NotificationHelper.escalateDelivery] Found " + pendingPMs.length + " PMs pending escalation");

    // Escalate notifications
    for (const notification of pendingNotifications) {
      const currentLevel = notification.deliveryMethod === "socket" ? 0 : 1;
      const nextLevel = currentLevel + 1;

      let title = "New Notification";
      if (notification.message.includes("Volunteer Requests:")) {
        title = "New Plan Assignment";
      } else if (notification.message.startsWith("New message:")) {
        title = notification.message;
      } else {
        title = notification.message;
      }

      const newMethod = await this.attemptDeliveryWithEscalation(
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

    // Escalate private messages
    for (const pm of pendingPMs) {
      const currentLevel = pm.deliveryMethod === "socket" ? 0 : 1;
      const nextLevel = currentLevel + 1;

      // Other party = whichever of fromPersonId/toPersonId is NOT the notify recipient.
      const otherPersonId = pm.fromPersonId === pm.notifyPersonId ? pm.toPersonId : pm.fromPersonId;

      const newMethod = await this.attemptDeliveryWithEscalation(
        pm.churchId,
        pm.notifyPersonId,
        nextLevel,
        "New Private Message",
        "You have a new private message",
        "privateMessage",
        pm.id,
        { personId: otherPersonId, conversationId: pm.conversationId }
      );

      pm.deliveryMethod = newMethod;
      await NotificationHelper.repos.privateMessage.save(pm);
      console.log("[NotificationHelper.escalateDelivery] PM " + pm.id + " escalated from " + (currentLevel === 0 ? "socket" : "push") + " to " + newMethod);
    }

    console.log("[NotificationHelper.escalateDelivery] Escalation complete");
    return { notificationsEscalated: pendingNotifications.length, pmsEscalated: pendingPMs.length };
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
        // don't send notifications for live stream chat room.
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
          this.addDebugStep(debugTrace, "notify-validate-private-message-sender", "error", {
            senderPersonId,
            participants
          });
          console.warn("[chat-push] private message notification skipped: sender is not a conversation participant", {
            churchId: conversation.churchId,
            conversationId: conversation.id,
            senderPersonId,
            fromPersonId: pm.fromPersonId,
            toPersonId: pm.toPersonId,
            messageId: message.id
          });
          pm.notifyPersonId = null;
          pm.deliveryMethod = "complete";
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
          pm.deliveryMethod = "complete";
          await NotificationHelper.repos.privateMessage.save(pm);
          break;
        }
        this.addDebugStep(debugTrace, "notify-resolve-private-message-recipient", "ok", {
          notifyPersonId: pm.notifyPersonId,
          recipientDeviceCount: recipientDevices.length,
          recipientDeviceIds: recipientDevices.map((device) => device.id)
        });

        // Persist notifyPersonId first so the unread count query inside
        // attemptDeliveryWithEscalation includes this new message.
        await NotificationHelper.repos.privateMessage.save(pm);
        this.addDebugStep(debugTrace, "notify-save-private-message-target", "ok", {
          privateMessageId: pm.id,
          notifyPersonId: pm.notifyPersonId
        });

        // Use escalation logic - start at level 0 (socket)
        // navData.personId = the OTHER party in the chat (the sender), so the
        // service worker can deep-link to /mobile/messages/{senderPersonId}
        // (the route's [id] is the other person's id, not the conversation id).
        const deliveryMethod = await this.attemptDeliveryWithEscalation(
          message.churchId,
          pm.notifyPersonId,
          0, // Start at socket level
          `New Message from ${message.displayName}`,
          message.content,
          "privateMessage",
          pm.id || conversation.id,
          { personId: senderPersonId, conversationId: conversation.id },
          debugTrace
        );

        pm.deliveryMethod = deliveryMethod;
        await NotificationHelper.repos.privateMessage.save(pm);
        this.addDebugStep(debugTrace, "notify-save-private-message-delivery-method", "ok", {
          privateMessageId: pm.id,
          deliveryMethod
        });
        break;
      }
      default: {
        const allMessages: Message[] = await NotificationHelper.repos.message.loadForConversation(conversation.churchId, conversation.id);
        // Subscription model — latest action per person wins:
        //   - a "real" comment auto-subscribes the poster
        //   - a messageType="subscription" marker explicitly toggles their state
        //     ("off" content → unsubscribed; anything else → subscribed)
        // Iterate chronologically so the last action determines final state.
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

  static createNotifications = async (peopleIds: string[], churchId: string, contentType: string, contentId: string, message: string, link?: string, triggeredByPersonId?: string) => {
    this.ensureInitialized();
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
        triggeredByPersonId
      };
      notifications.push(notification);
    });

    // Return early if no notifications to create
    if (notifications.length === 0) return [];

    // don't notify people a second time about the same type of event.
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
    if (notifications.length > 0) {
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

          // Forward the wrapped content's type/id so the SW can deep-link to
          // the actual conversation/group/etc. instead of the notifications list.
          const deliveryMethod = await NotificationHelper.attemptDeliveryWithEscalation(
            n.churchId,
            n.personId,
            0, // Start at socket level
            title,
            n.message,
            "notification",
            notification.id,
            { innerType: n.contentType, innerId: n.contentId }
          );

          // Save the delivery method
          notification.deliveryMethod = deliveryMethod;
          await NotificationHelper.repos.notification.save(notification);

          return notification;
        });
        promises.push(promise);
      });
      const result = await Promise.all(promises);
      return result;
    } else return [];
  };

  static notifyUser = async (churchId: string, personId: string, title: string = "New Notification") => {
    this.ensureInitialized();
    // Removed excessive logging to reduce CloudWatch costs
    let method = "";
    const _deliveryCount = 0;

    // Handle web socket notifications
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

    // Handle push notifications
    const devices: Device[] = (await NotificationHelper.repos.device.loadForPerson(churchId, personId)) as any[];

    if (devices.length > 0) {
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

  static notifyUserForPrivateMessage = async (churchId: string, personId: string, senderName: string, messageContent: string, conversationId: string, privateMessageId?: string) => {
    this.ensureInitialized();
    let method = "";
    const contentType = "privateMessage";
    const contentId = privateMessageId || conversationId;

    // Handle web socket notifications
    const connections = await NotificationHelper.repos.connection.loadForNotification(churchId, personId);
    if (connections.length > 0) {
      const deliveryCount = await DeliveryHelper.sendMessages(connections, {
        churchId,
        conversationId: "alert",
        action: "privateMessage",
        data: {}
      });
      for (const [index, conn] of connections.entries()) {
        await this.logDelivery(churchId, personId, contentType, contentId, "socket", index < deliveryCount, conn.socketId, index < deliveryCount ? undefined : "Socket delivery failed");
      }
      if (deliveryCount > 0) method = "socket";
    }

    // Handle push notifications
    const devices: Device[] = (await NotificationHelper.repos.device.loadForPerson(churchId, personId)) as any[];

    if (devices.length > 0) {
      const allTokens = devices.map((device) => device.fcmToken).filter((token) => !!token) as string[];
      const expoPushTokens = [...new Set(allTokens.filter((token) => token.startsWith("ExponentPushToken[")))];
      const { activeTokens: webPushTokens, staleTokens: staleWebPushTokens } = this.prepareWebPushDevices(devices);
      const title = `New Message from ${senderName}`;
      if (staleWebPushTokens.length > 0) {
        await Promise.all(staleWebPushTokens.map((token) => this.deleteInvalidToken(token)));
      }

      if (expoPushTokens.length > 0) {
        try {
          const tickets = await ExpoPushHelper.sendBulkTypedMessages(expoPushTokens, title, messageContent, "privateMessage", conversationId);
          method = "push";
          for (let i = 0; i < expoPushTokens.length; i++) {
            const ticket = tickets?.[i];
            const success = ticket?.status === "ok";
            const errorMsg = ticket?.status === "error" ? (ticket as any).message : undefined;
            await this.logDelivery(churchId, personId, contentType, contentId, "push", success, expoPushTokens[i], errorMsg);
            if (!success && ticket?.status === "error") await this.deleteInvalidToken(expoPushTokens[i]);
          }
        } catch (error) {
          console.error("Push notification failed for private message:", error);
          for (const token of expoPushTokens) {
            await this.logDelivery(churchId, personId, contentType, contentId, "push", false, token, String(error));
          }
        }
      }

      if (webPushTokens.length > 0) {
        try {
          const results = await WebPushHelper.sendBulkTypedMessages(webPushTokens, title, messageContent, "privateMessage", conversationId);
          for (const r of results) {
            const details = [r.diagnosticCode, r.statusCode, r.endpointHost, r.errorMessage].filter((value) => value !== undefined && value !== "").join(" | ");
            await this.logDelivery(churchId, personId, contentType, contentId, "push", r.success, r.token, details || undefined);
            if (r.gone) await this.deleteInvalidToken(r.token);
          }
          if (results.some((r) => r.success)) method = "push";
          else if (results.some((r) => r.retryable)) method = "push";
        } catch (error) {
          console.error("Web push notification failed for private message:", error);
          for (const token of webPushTokens) {
            await this.logDelivery(churchId, personId, contentType, contentId, "push", false, token, String(error));
          }
        }
      }
    }

    return method;
  };

  static notifyUserForGeneralNotification = async (churchId: string, personId: string, notificationMessage: string, notificationId: string) => {
    this.ensureInitialized();
    let method = "";
    const contentType = "notification";

    // Handle web socket notifications
    const connections = await NotificationHelper.repos.connection.loadForNotification(churchId, personId);
    if (connections.length > 0) {
      const deliveryCount = await DeliveryHelper.sendMessages(connections, {
        churchId,
        conversationId: "alert",
        action: "notification",
        data: {}
      });
      for (const [index, conn] of connections.entries()) {
        await this.logDelivery(churchId, personId, contentType, notificationId, "socket", index < deliveryCount, conn.socketId, index < deliveryCount ? undefined : "Socket delivery failed");
      }
      if (deliveryCount > 0) method = "socket";
    }

    // Handle push notifications
    const devices: Device[] = (await NotificationHelper.repos.device.loadForPerson(churchId, personId)) as any[];

    if (devices.length > 0) {
      const allTokens = devices.map((device) => device.fcmToken).filter((token) => !!token) as string[];
      const expoPushTokens = [...new Set(allTokens.filter((token) => token.startsWith("ExponentPushToken[")))];
      const { activeTokens: webPushTokens, staleTokens: staleWebPushTokens } = this.prepareWebPushDevices(devices);
      if (staleWebPushTokens.length > 0) {
        await Promise.all(staleWebPushTokens.map((token) => this.deleteInvalidToken(token)));
      }

      let title = "New Notification";
      if (notificationMessage.includes("Volunteer Requests:")) {
        title = "New Plan Assignment";
      } else if (notificationMessage.startsWith("New message:")) {
        title = notificationMessage;
      } else {
        title = notificationMessage;
      }

      if (expoPushTokens.length > 0) {
        try {
          const tickets = await ExpoPushHelper.sendBulkTypedMessages(expoPushTokens, title, notificationMessage, "notification", notificationId);
          method = "push";
          for (let i = 0; i < expoPushTokens.length; i++) {
            const ticket = tickets?.[i];
            const success = ticket?.status === "ok";
            const errorMsg = ticket?.status === "error" ? (ticket as any).message : undefined;
            await this.logDelivery(churchId, personId, contentType, notificationId, "push", success, expoPushTokens[i], errorMsg);
            if (!success && ticket?.status === "error") await this.deleteInvalidToken(expoPushTokens[i]);
          }
        } catch (error) {
          console.error("Push notification failed for general notification:", error);
          for (const token of expoPushTokens) {
            await this.logDelivery(churchId, personId, contentType, notificationId, "push", false, token, String(error));
          }
        }
      }

      if (webPushTokens.length > 0) {
        try {
          const results = await WebPushHelper.sendBulkTypedMessages(webPushTokens, title, notificationMessage, "notification", notificationId);
          for (const r of results) {
            const details = [r.diagnosticCode, r.statusCode, r.endpointHost, r.errorMessage].filter((value) => value !== undefined && value !== "").join(" | ");
            await this.logDelivery(churchId, personId, contentType, notificationId, "push", r.success, r.token, details || undefined);
            if (r.gone) await this.deleteInvalidToken(r.token);
          }
          if (results.some((r) => r.success)) method = "push";
          else if (results.some((r) => r.retryable)) method = "push";
        } catch (error) {
          console.error("Web push notification failed for general notification:", error);
          for (const token of webPushTokens) {
            await this.logDelivery(churchId, personId, contentType, notificationId, "push", false, token, String(error));
          }
        }
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

    console.log("[NotificationHelper.sendEmailNotifications] Loading undelivered notifications...");
    const rawNotifications = await NotificationHelper.repos.notification.loadUndelivered();
    console.log("[NotificationHelper.sendEmailNotifications] Raw notifications type: " + typeof rawNotifications);
    console.log("[NotificationHelper.sendEmailNotifications] Raw notifications isArray: " + Array.isArray(rawNotifications));
    console.log("[NotificationHelper.sendEmailNotifications] Raw notifications sample: " + JSON.stringify(rawNotifications?.slice?.(0, 2) || rawNotifications));
    const allNotifications: Notification[] = (rawNotifications || []) as any[];
    console.log("[NotificationHelper.sendEmailNotifications] Loaded notifications (" + (Date.now() - startTime) + "ms)");

    console.log("[NotificationHelper.sendEmailNotifications] Loading undelivered PMs...");
    const rawPMs = await NotificationHelper.repos.privateMessage.loadUndelivered();
    console.log("[NotificationHelper.sendEmailNotifications] Raw PMs type: " + typeof rawPMs);
    console.log("[NotificationHelper.sendEmailNotifications] Raw PMs sample: " + JSON.stringify(rawPMs?.slice?.(0, 2) || rawPMs));
    const allPMs: PrivateMessage[] = (rawPMs || []) as any[];
    console.log("[NotificationHelper.sendEmailNotifications] Loaded PMs (" + (Date.now() - startTime) + "ms)");

    console.log("[NotificationHelper.sendEmailNotifications] Found " + allNotifications.length + " undelivered notifications, " + allPMs.length + " undelivered PMs");
    if (allNotifications.length > 0) {
      console.log("[NotificationHelper.sendEmailNotifications] First notification keys: " + Object.keys(allNotifications[0] || {}).join(", "));
      console.log("[NotificationHelper.sendEmailNotifications] First notification personId: " + (allNotifications[0] as any)?.personId);
    }

    if (allNotifications.length === 0 && allPMs.length === 0) {
      console.log("[NotificationHelper.sendEmailNotifications] No undelivered items found, returning early");
      return;
    }

    const notifPersonIds = ArrayHelper.getIds(allNotifications, "personId");
    const pmPersonIds = ArrayHelper.getIds(allPMs, "notifyPersonId");
    console.log("[NotificationHelper.sendEmailNotifications] notifPersonIds from ArrayHelper: " + JSON.stringify(notifPersonIds));
    console.log("[NotificationHelper.sendEmailNotifications] pmPersonIds from ArrayHelper: " + JSON.stringify(pmPersonIds));
    const peopleIds = notifPersonIds.concat(pmPersonIds);
    console.log("[NotificationHelper.sendEmailNotifications] Processing " + peopleIds.length + " unique people");

    const notificationPrefs = (await NotificationHelper.repos.notificationPreference.loadByPersonIds(peopleIds)) as any[];
    console.log("[NotificationHelper.sendEmailNotifications] Found " + notificationPrefs.length + " existing notification preferences");

    const todoPrefs: NotificationPreference[] = [];
    for (const personId of peopleIds) {
      const notifications: Notification[] = ArrayHelper.getAll(allNotifications, "personId", personId);
      const pms: PrivateMessage[] = ArrayHelper.getAll(allPMs, "notifyPersonId", personId);
      let pref = ArrayHelper.getOne(notificationPrefs, "personId", personId);
      if (!pref) {
        console.log("[NotificationHelper.sendEmailNotifications] Creating default pref for person " + personId);
        pref = await this.createNotificationPref(notifications[0]?.churchId || pms[0]?.churchId, personId);
      }
      console.log("[NotificationHelper.sendEmailNotifications] Person " + personId + ": emailFrequency=" + pref.emailFrequency + ", notifications=" + notifications.length + ", pms=" + pms.length);
      if (pref.emailFrequency === "never") {
        console.log("[NotificationHelper.sendEmailNotifications] Person " + personId + " has email disabled, marking as 'complete'");
        promises = promises.concat(this.markMethod(notifications, pms, "complete"));
      } else if (pref.emailFrequency === frequency) {
        console.log("[NotificationHelper.sendEmailNotifications] Person " + personId + " matches frequency '" + frequency + "', adding to todo");
        todoPrefs.push(pref);
      } else {
        console.log("[NotificationHelper.sendEmailNotifications] Person " + personId + " has frequency '" + pref.emailFrequency + "', skipping for '" + frequency + "' run");
      }
      // else: leave for the other timer (don't mark as "none")
    }

    console.log("[NotificationHelper.sendEmailNotifications] " + todoPrefs.length + " people to process for '" + frequency + "' frequency");

    if (todoPrefs.length > 0) {
      console.log("[NotificationHelper.sendEmailNotifications] Fetching email addresses from membership API...");
      const allEmailData = await this.getEmailData(todoPrefs);
      console.log("[NotificationHelper.sendEmailNotifications] Got " + (allEmailData?.length || 0) + " email addresses");

      // Collect sender personIds from PMs and triggeredByPersonIds from notifications for reply-to
      console.log("[NotificationHelper.sendEmailNotifications] allPMs sample for sender lookup: " + JSON.stringify(allPMs.slice(0, 2).map(pm => ({ id: pm.id, fromPersonId: pm.fromPersonId, notifyPersonId: pm.notifyPersonId }))));
      const pmSenderIds = allPMs.map(pm => pm.fromPersonId).filter(id => id);
      const notifTriggerIds = allNotifications.map(n => n.triggeredByPersonId).filter(id => id);
      const allTriggerPersonIds = [...new Set([...pmSenderIds, ...notifTriggerIds])];
      console.log("[NotificationHelper.sendEmailNotifications] allTriggerPersonIds (PM senders + notification triggers): " + JSON.stringify(allTriggerPersonIds));

      let triggerEmailData: any[] = [];
      if (allTriggerPersonIds.length > 0) {
        console.log("[NotificationHelper.sendEmailNotifications] Fetching trigger/sender emails for reply-to...");
        const triggerPrefs = allTriggerPersonIds.map(personId => ({ personId } as NotificationPreference));
        triggerEmailData = await this.getEmailData(triggerPrefs);
        console.log("[NotificationHelper.sendEmailNotifications] Got " + (triggerEmailData?.length || 0) + " trigger email addresses");
        console.log("[NotificationHelper.sendEmailNotifications] triggerEmailData: " + JSON.stringify(triggerEmailData));
      } else {
        console.log("[NotificationHelper.sendEmailNotifications] No trigger personIds found, skipping reply-to lookup");
      }

      todoPrefs.forEach((pref) => {
        const notifications: Notification[] = ArrayHelper.getAll(allNotifications, "personId", pref.personId);
        const pms: PrivateMessage[] = ArrayHelper.getAll(allPMs, "notifyPersonId", pref.personId);
        const emailData = ArrayHelper.getOne(allEmailData, "id", pref.personId);

        // Get sender/trigger email for reply-to
        // Priority: PM sender > notification triggeredBy
        let senderEmail: string | undefined;
        if (pms.length > 0 && pms[0].fromPersonId) {
          const senderData = ArrayHelper.getOne(triggerEmailData, "id", pms[0].fromPersonId);
          senderEmail = senderData?.email;
        } else if (notifications.length > 0 && notifications[0].triggeredByPersonId) {
          const triggerData = ArrayHelper.getOne(triggerEmailData, "id", notifications[0].triggeredByPersonId);
          senderEmail = triggerData?.email;
        }

        console.log("[NotificationHelper.sendEmailNotifications] Person " + pref.personId + ": email=" + (emailData?.email || "NOT FOUND") + ", notifications=" + notifications.length + ", pms=" + pms.length + ", replyTo=" + (senderEmail || "none"));
        if (emailData?.email && (notifications.length > 0 || pms.length > 0)) {
          console.log("[NotificationHelper.sendEmailNotifications] Queuing email to " + emailData.email);
          promises.push(this.sendEmailNotification(emailData.email, notifications, pms, senderEmail));
        } else {
          console.log("[NotificationHelper.sendEmailNotifications] Skipping person " + pref.personId + " - no email or no items");
        }
      });
    }
    console.log("[NotificationHelper.sendEmailNotifications] Waiting for " + promises.length + " promises to complete...");
    await Promise.all(promises);
    console.log("[NotificationHelper.sendEmailNotifications] ========== COMPLETE ==========");
    console.log("[NotificationHelper.sendEmailNotifications] Total execution time: " + (Date.now() - startTime) + "ms");
    return { frequency, notificationsProcessed: allNotifications.length, pmsProcessed: allPMs.length, emailsSent: promises.length };
  };

  static markMethod = (notifications: Notification[], privateMessages: PrivateMessage[], method: string) => {
    const promises: Promise<any>[] = [];
    notifications.forEach((notification) => {
      notification.deliveryMethod = method;
      promises.push(NotificationHelper.repos.notification.save(notification));
    });
    privateMessages.forEach((pm) => {
      pm.deliveryMethod = method;
      promises.push(NotificationHelper.repos.privateMessage.save(pm));
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

  static sendEmailNotification = async (email: string, notifications: Notification[], privateMessages: PrivateMessage[], senderEmail?: string) => {
    console.log("[NotificationHelper.sendEmailNotification] Starting email send to: " + email + (senderEmail ? " (reply-to: " + senderEmail + ")" : ""));

    if (!email || typeof email !== "string" || !email.includes("@")) {
      console.error("[NotificationHelper.sendEmailNotification] Invalid email address: " + email + ", skipping send");
      return;
    }

    let title = "";
    let content = "";

    const notifCount = notifications?.length || 0;
    const pmCount = privateMessages?.length || 0;
    const totalCount = notifCount + pmCount;

    console.log("[NotificationHelper.sendEmailNotification] Items: " + notifCount + " notifications, " + pmCount + " private messages");

    // Early return if nothing to send
    if (totalCount === 0) {
      console.log("[NotificationHelper.sendEmailNotification] No items to send, returning early");
      return;
    }

    const firstNotification = notifications?.[0];

    if (notifCount === 1 && pmCount === 0 && firstNotification) {
      if (firstNotification.message.includes("Volunteer Requests:")) {
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
    } else if (notifCount === 0 && pmCount === 1) title = "New Private Message";
    else if (notifCount > 0 && pmCount > 0) title = totalCount + " New Notifications and Messages";
    else if (notifCount > 0) title = notifCount + " New Notification" + (notifCount > 1 ? "s" : "");
    else if (pmCount > 0) title = pmCount + " New Private Message" + (pmCount > 1 ? "s" : "");

    console.log("[NotificationHelper.sendEmailNotification] Email title: " + title);
    console.log("[NotificationHelper.sendEmailNotification] Calling EmailHelper.sendTemplatedEmail...");

    // Use reply-to for PM/notification emails (so recipient can reply directly to sender/trigger)
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

    // Log email delivery for each notification
    for (const notification of notifications) {
      await this.logDelivery(notification.churchId, notification.personId, "notification", notification.id, "email", emailSuccess, email, emailError);
    }

    // Log email delivery for each private message
    for (const pm of privateMessages) {
      await this.logDelivery(pm.churchId, pm.notifyPersonId, "privateMessage", pm.id, "email", emailSuccess, email, emailError);
    }

    if (emailSuccess) {
      console.log("[NotificationHelper.sendEmailNotification] Marking " + notifications.length + " notifications and " + privateMessages.length + " PMs as complete");
      const promises: Promise<any>[] = this.markMethod(notifications, privateMessages, "complete");
      await Promise.all(promises);
      console.log("[NotificationHelper.sendEmailNotification] Delivery method updated to complete");
    } else {
      console.log("[NotificationHelper.sendEmailNotification] Email failed, NOT marking items as delivered");
    }
  };
}
