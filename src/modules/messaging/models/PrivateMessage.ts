import { Conversation } from "./Conversation";

export class PrivateMessage {
  public id?: string;
  public churchId?: string;
  public fromPersonId?: string;
  public toPersonId?: string;
  public conversationId?: string;
  public notifyPersonId?: string;
  public deliveryMethod?: string;

  public conversation?: Conversation;
}
