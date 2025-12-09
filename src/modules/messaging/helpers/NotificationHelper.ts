import { ArrayHelper, EmailHelper } from "@churchapps/apihelper";
import { Conversation, DeliveryLog, Device, Message, PrivateMessage, Notification, NotificationPreference } from "../models";
import { Repos } from "../repositories";
import { DeliveryHelper } from "./DeliveryHelper";
import { ExpoPushHelper } from "./ExpoPushHelper";
import axios from "axios";
import { Environment } from "../../../shared/helpers/Environment";

export class NotificationHelper {
  private static repos: Repos;

  static init(repos: Repos) {
    NotificationHelper.repos = repos;
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

  static checkShouldNotify = async (conversation: Conversation, message: Message, senderPersonId: string, _title?: string) => {
    switch (conversation.contentType) {
      case "streamingLive":
        // don't send notifications for live stream chat room.
        break;
      case "privateMessage": {
        const pm: PrivateMessage = await NotificationHelper.repos.privateMessage.loadByConversationId(conversation.churchId, conversation.id);
        pm.notifyPersonId = pm.fromPersonId === senderPersonId ? pm.toPersonId : pm.fromPersonId;
        await NotificationHelper.repos.privateMessage.save(pm);
        const _method = await this.notifyUserForPrivateMessage(message.churchId, pm.notifyPersonId, message.displayName, message.content, conversation.id);
        if (_method) {
          pm.deliveryMethod = _method;
          await NotificationHelper.repos.privateMessage.save(pm);
        }
        break;
      }
      default: {
        const allMessages: Message[] = await NotificationHelper.repos.message.loadForConversation(conversation.churchId, conversation.id);
        const peopleIds = ArrayHelper.getIds(allMessages, "personId");
        if (peopleIds.length > 1) {
          for (let i = peopleIds.length - 1; i >= 0; i--) {
            if (peopleIds[i] === senderPersonId) peopleIds.splice(i, 1);
          }
          await this.createNotifications(peopleIds, conversation.churchId, conversation.contentType, conversation.contentId, "New message: " + conversation.title);
        }
        break;
      }
    }
  };

  static createNotifications = async (peopleIds: string[], churchId: string, contentType: string, contentId: string, message: string, link?: string) => {
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
        link
      };
      notifications.push(notification);
    });

    // Return early if no notifications to create
    if (notifications.length === 0) return [];

    // don't notify people a second time about the same type of event.
    const existing = (await NotificationHelper.repos.notification.loadExistingUnread(notifications[0].churchId, notifications[0].contentType, notifications[0].contentId)) as any[] || [];
    for (let i = notifications.length - 1; i >= 0; i--) {
      if (existing.length > 0 && ArrayHelper.getAll(existing, "personId", notifications[i].personId).length > 0) notifications.splice(i, 1);
    }
    if (notifications.length > 0) {
      const promises: Promise<Notification>[] = [];
      notifications.forEach((n) => {
        const promise = NotificationHelper.repos.notification.save(n).then(async (notification) => {
          const method = await NotificationHelper.notifyUserForGeneralNotification(n.churchId, n.personId, n.message, notification.id);
          notification.deliveryMethod = method;
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
    // Removed excessive logging to reduce CloudWatch costs
    let method = "";
    const _deliveryCount = 0;

    // Handle web socket notifications
    const connections = await NotificationHelper.repos.connection.loadForNotification(churchId, personId);
    if (connections.length > 0) {
      method = "socket";
      await DeliveryHelper.sendMessages(connections, {
        churchId,
        conversationId: "alert",
        action: "notification",
        data: {}
      });
    }

    // Handle push notifications
    const devices: Device[] = (await NotificationHelper.repos.device.loadForPerson(churchId, personId)) as any[];

    if (devices.length > 0) {
      try {
        // Filter out any invalid tokens and get unique tokens
        const expoPushTokens = [...new Set(devices.map((device) => device.fcmToken).filter((token) => token && token.startsWith("ExponentPushToken[")))];

        if (expoPushTokens.length > 0) {
          // Send notifications in bulk for efficiency
          await ExpoPushHelper.sendBulkMessages(expoPushTokens, title, title);
          method = "push";
          // Only log significant events or errors, not routine operations
        }
      } catch (error) {
        // Log the error but don't throw - we still want to return the method if socket delivery worked
        console.error("Push notification failed for notifyUser:", error);
      }
    }

    return method;
  };

  static notifyUserForPrivateMessage = async (churchId: string, personId: string, senderName: string, messageContent: string, conversationId: string, privateMessageId?: string) => {
    let method = "";
    const contentType = "privateMessage";
    const contentId = privateMessageId || conversationId;

    // Handle web socket notifications
    const connections = await NotificationHelper.repos.connection.loadForNotification(churchId, personId);
    if (connections.length > 0) {
      method = "socket";
      await DeliveryHelper.sendMessages(connections, {
        churchId,
        conversationId: "alert",
        action: "privateMessage",
        data: {}
      });
      for (const conn of connections) {
        await this.logDelivery(churchId, personId, contentType, contentId, "socket", true, conn.socketId);
      }
    }

    // Handle push notifications
    const devices: Device[] = (await NotificationHelper.repos.device.loadForPerson(churchId, personId)) as any[];

    if (devices.length > 0) {
      try {
        const expoPushTokens = [...new Set(devices.map((device) => device.fcmToken).filter((token) => token && token.startsWith("ExponentPushToken[")))];

        if (expoPushTokens.length > 0) {
          const title = `New Message from ${senderName}`;
          const tickets = await ExpoPushHelper.sendBulkTypedMessages(expoPushTokens, title, messageContent, "privateMessage", conversationId);
          method = "push";
          for (let i = 0; i < expoPushTokens.length; i++) {
            const ticket = tickets?.[i];
            const success = ticket?.status === "ok";
            const errorMsg = ticket?.status === "error" ? (ticket as any).message : undefined;
            await this.logDelivery(churchId, personId, contentType, contentId, "push", success, expoPushTokens[i], errorMsg);
            if (!success && ticket?.status === "error") await this.deleteInvalidToken(expoPushTokens[i]);
          }
        }
      } catch (error) {
        console.error("Push notification failed for private message:", error);
        for (const token of [...new Set(devices.map((device) => device.fcmToken).filter((token) => token && token.startsWith("ExponentPushToken[")))]) {
          await this.logDelivery(churchId, personId, contentType, contentId, "push", false, token, String(error));
        }
      }
    }

    return method;
  };

  static notifyUserForGeneralNotification = async (churchId: string, personId: string, notificationMessage: string, notificationId: string) => {
    let method = "";
    const contentType = "notification";

    // Handle web socket notifications
    const connections = await NotificationHelper.repos.connection.loadForNotification(churchId, personId);
    if (connections.length > 0) {
      method = "socket";
      await DeliveryHelper.sendMessages(connections, {
        churchId,
        conversationId: "alert",
        action: "notification",
        data: {}
      });
      for (const conn of connections) {
        await this.logDelivery(churchId, personId, contentType, notificationId, "socket", true, conn.socketId);
      }
    }

    // Handle push notifications
    const devices: Device[] = (await NotificationHelper.repos.device.loadForPerson(churchId, personId)) as any[];

    if (devices.length > 0) {
      try {
        const expoPushTokens = [...new Set(devices.map((device) => device.fcmToken).filter((token) => token && token.startsWith("ExponentPushToken[")))];

        if (expoPushTokens.length > 0) {
          let title = "New Notification";
          if (notificationMessage.includes("Volunteer Requests:")) {
            title = "New Plan Assignment";
          } else if (notificationMessage.startsWith("New message:")) {
            title = notificationMessage;
          } else {
            title = notificationMessage;
          }

          const tickets = await ExpoPushHelper.sendBulkTypedMessages(expoPushTokens, title, notificationMessage, "notification", notificationId);
          method = "push";
          for (let i = 0; i < expoPushTokens.length; i++) {
            const ticket = tickets?.[i];
            const success = ticket?.status === "ok";
            const errorMsg = ticket?.status === "error" ? (ticket as any).message : undefined;
            await this.logDelivery(churchId, personId, contentType, notificationId, "push", success, expoPushTokens[i], errorMsg);
            if (!success && ticket?.status === "error") await this.deleteInvalidToken(expoPushTokens[i]);
          }
        }
      } catch (error) {
        console.error("Push notification failed for general notification:", error);
        for (const token of [...new Set(devices.map((device) => device.fcmToken).filter((token) => token && token.startsWith("ExponentPushToken[")))]) {
          await this.logDelivery(churchId, personId, contentType, notificationId, "push", false, token, String(error));
        }
      }
    }

    return method;
  };

  static sendEmailNotifications = async (frequency: string) => {
    let promises: Promise<any>[] = [];
    const allNotifications: Notification[] = (await NotificationHelper.repos.notification.loadUndelivered()) as any[];
    const allPMs: PrivateMessage[] = (await NotificationHelper.repos.privateMessage.loadUndelivered()) as any[];
    // Removed excessive logging - only log significant batch operations
    if (allNotifications.length === 0 && allPMs.length === 0) return;

    const peopleIds = ArrayHelper.getIds(allNotifications, "personId").concat(ArrayHelper.getIds(allPMs, "notifyPersonId"));

    const notificationPrefs = (await NotificationHelper.repos.notificationPreference.loadByPersonIds(peopleIds)) as any[];
    const todoPrefs: NotificationPreference[] = [];
    for (const personId of peopleIds) {
      const notifications: Notification[] = ArrayHelper.getAll(allNotifications, "personId", personId);
      const pms: PrivateMessage[] = ArrayHelper.getAll(allPMs, "notifyPersonId", personId);
      let pref = ArrayHelper.getOne(notificationPrefs, "personId", personId);
      if (!pref) pref = await this.createNotificationPref(notifications[0]?.churchId || pms[0]?.churchId, personId);
      if (pref.emailFrequency === "never") promises = promises.concat(this.markMethod(notifications, pms, "none"));
      else if (pref.emailFrequency === frequency) todoPrefs.push(pref);
      else promises = promises.concat(this.markMethod(notifications, pms, "none"));
    }

    if (todoPrefs.length > 0) {
      const allEmailData = await this.getEmailData(todoPrefs);
      todoPrefs.forEach((pref) => {
        const notifications: Notification[] = ArrayHelper.getAll(allNotifications, "personId", pref.personId);
        const pms: PrivateMessage[] = ArrayHelper.getAll(allPMs, "notifyPersonId", pref.personId);
        const emailData = ArrayHelper.getOne(allEmailData, "id", pref.personId);
        if (emailData && (notifications.length > 0 || pms.length > 0)) promises.push(this.sendEmailNotification(emailData.email, notifications, pms));
      });
    }
    await Promise.all(promises);
  };

  static markMethod = (notifications: Notification[], privateMessages: PrivateMessage[], _method: string) => {
    const promises: Promise<any>[] = [];
    notifications.forEach((notification) => {
      notification.deliveryMethod = "none";
      promises.push(NotificationHelper.repos.notification.save(notification));
    });
    privateMessages.forEach((pm) => {
      pm.deliveryMethod = "none";
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
    const data = {
      peopleIds,
      jwtSecret: Environment.jwtSecret
    };
    const result = await axios.post(Environment.membershipApi + "/people/apiEmails", data);
    return result.data;
  };

  static sendEmailNotification = async (email: string, notifications: Notification[], privateMessages: PrivateMessage[]) => {
    let title = "";
    let content = "";

    const notifCount = notifications?.length || 0;
    const pmCount = privateMessages?.length || 0;
    const totalCount = notifCount + pmCount;

    // Early return if nothing to send
    if (totalCount === 0) return;

    const firstNotification = notifications?.[0];

    if (notifCount === 1 && pmCount === 0 && firstNotification) {
      if (firstNotification.message.includes("Volunteer Requests:")) {
        const match = firstNotification.message.match(/Volunteer Requests:(.*).Please log in and confirm/);
        title = "New Notification: Volunteer Request";
        content = `
          <h3>New Notification</h3>
          <h4>Volunteer Request</h4>
          <h4>${match ? match[1] : firstNotification.message}</h4>
          ${
            firstNotification.link
              ? "<a href='" +
                firstNotification.link +
                "' target='_blank'><button style='background-color: #0288d1; border:2px solid #0288d1; border-radius: 5px; color:white; cursor: pointer; padding: 5px'>View Details</button></a>"
              : ""
          }
          <p>Please log in and confirm</p>
        `;
      } else {
        title = "New Notification: " + firstNotification.message;
        content = "New Notification: " + firstNotification.message;
      }
    } else if (notifCount === 0 && pmCount === 1) title = "New Private Message";
    else if (notifCount > 0 && pmCount > 0) title = `${totalCount} New Notifications and Messages`;
    else if (notifCount > 0) title = `${notifCount} New Notification${notifCount > 1 ? "s" : ""}`;
    else if (pmCount > 0) title = `${pmCount} New Private Message${pmCount > 1 ? "s" : ""}`;

    let emailSuccess = true;
    let emailError: string | undefined;
    try {
      await EmailHelper.sendTemplatedEmail("support@churchapps.org", email, "B1.church", "https://admin.b1.church", title, content, "ChurchEmailTemplate.html");
    } catch (error) {
      emailSuccess = false;
      emailError = String(error);
      console.error("Email notification failed:", error);
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
      const promises: Promise<any>[] = this.markMethod(notifications, privateMessages, "email");
      await Promise.all(promises);
    }
  };
}
