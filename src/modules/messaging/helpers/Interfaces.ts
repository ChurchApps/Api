import WebSocket from "ws";

export type PayloadAction = "message" | "deleteMessage" | "callout" | "attendance" | "prayerRequest" | "socketId" | "privateMessage" | "privateRoomAdded" | "videoChatInvite" | "notification" | "blockedIp";

export interface PayloadInterface {
  churchId: string;
  conversationId: string;
  action: PayloadAction;
  data: any;
}
export interface AttendanceInterface {
  viewers?: ViewerInterface[];
  totalViewers?: number;
  conversationId: string;
}
export interface ViewerInterface {
  displayName: string;
  id: string;
}
export interface SocketConnectionInterface {
  id: string;
  socket: WebSocket;
}
