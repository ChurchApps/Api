export class GroupMemberHistory {
  public id?: string;
  public churchId?: string;
  public groupId?: string;
  public personId?: string;
  public action?: "joined" | "left";
  public actionDate?: Date;
}
