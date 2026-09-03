export class PlanItem {
  public id?: string;
  public churchId?: string;
  public planId?: string;
  public parentId?: string;
  public sort?: number;
  public itemType?: string;
  public actionType?: string;
  public relatedId?: string;
  public positionId?: string;
  public label?: string;
  public description?: string;
  public seconds?: number;
  public link?: string;
  public providerId?: string;
  public providerPath?: string;
  public providerContentPath?: string;
  public thumbnailUrl?: string;
  public assignees?: string;

  public children?: PlanItem[];
}
