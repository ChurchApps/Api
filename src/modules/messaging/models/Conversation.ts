import { Message } from "./Message.js";

export class Conversation {
  public id?: string;
  public churchId?: string;
  public contentType?: string;
  public contentId?: string;
  public title?: string;
  public dateCreated?: Date;
  public groupId?: string;
  public visibility?: string;
  public firstPostId?: string;
  public lastPostId?: string;
  public postCount?: number;
  public postType?: string;
  public allowAnonymousPosts?: boolean;

  public messages?: Message[];
}
