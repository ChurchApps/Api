export class SearchCondition {
  public field: string;
  public operator: "equals" | "startsWith" | "endsWith" | "contains" | "greaterThan" | "lessThan" | "lastDays";
  public value: string;
}
