import { Expo, ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";
import { Environment } from "../../../shared/helpers/Environment.js";

export class ExpoPushHelper {
  private static expo: Expo;

  static init() {
    if (!ExpoPushHelper.expo) {
      ExpoPushHelper.expo = new Expo();
    }
  }

  static async sendBulkMessages(tokens: string[], title: string, body: string) {
    ExpoPushHelper.init();

    const messages: ExpoPushMessage[] = [];

    for (const pushToken of tokens) {
      if (!Expo.isExpoPushToken(pushToken)) {
        console.error(`Push token ${pushToken} is not a valid Expo push token`);
        continue;
      }

      messages.push({
        to: pushToken,
        sound: "default",
        title,
        body,
        data: { title, body }
      });
    }

    if (messages.length === 0) return;

    try {
      const chunks = ExpoPushHelper.expo.chunkPushNotifications(messages);
      const tickets: ExpoPushTicket[] = [];

      for (const chunk of chunks) {
        try {
          const ticketChunk = await ExpoPushHelper.expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
        } catch (error) {
          console.error("Error sending push notification chunk:", error);
        }
      }

      return tickets;
    } catch (error) {
      console.error("Error in sendBulkMessages:", error);
    }
  }

  // Tickets come back aligned with the input tokens (ticket[i] belongs to tokens[i]).
  static async sendBulkTypedMessages(tokens: string[], title: string, body: string, type: string, contentId: string, extra?: Record<string, unknown>): Promise<ExpoPushTicket[]> {
    ExpoPushHelper.init();

    const messages: ExpoPushMessage[] = [];

    for (const pushToken of tokens) {
      if (!Expo.isExpoPushToken(pushToken)) {
        console.error(`Push token ${pushToken} is not a valid Expo push token`);
        continue;
      }

      messages.push({
        to: pushToken,
        sound: "default",
        title,
        body,
        data: {
          title,
          body,
          type,
          contentId,
          url: `${Environment.membershipApi}/${type}/${contentId}`,
          ...(extra || {})
        }
      });
    }

    const ticketByToken = new Map<string, ExpoPushTicket>();
    for (const chunk of ExpoPushHelper.expo.chunkPushNotifications(messages)) {
      let ticketChunk: ExpoPushTicket[] = [];
      try {
        ticketChunk = await ExpoPushHelper.expo.sendPushNotificationsAsync(chunk);
      } catch (error) {
        console.error("Error sending typed push notification chunk:", error);
      }
      chunk.forEach((m, i) => ticketByToken.set(m.to as string, ticketChunk[i] || ({ status: "error", message: "Chunk send failed" } as ExpoPushTicket)));
    }

    return tokens.map((token) => ticketByToken.get(token) || ({ status: "error", message: "Invalid Expo push token" } as ExpoPushTicket));
  }
}
