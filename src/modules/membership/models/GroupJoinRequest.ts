import { Group, Person } from "./index.js";

export class GroupJoinRequest {
  public id?: string;
  public churchId?: string;
  public groupId?: string;
  public personId?: string;
  public message?: string;
  public requestDate?: Date;
  public status?: "pending" | "approved" | "declined" | "cancelled";
  public decidedBy?: string;
  public decidedDate?: Date;
  public declineReason?: string;
  public person?: Person;
  public group?: Group;
}
