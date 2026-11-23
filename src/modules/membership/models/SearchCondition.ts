export class SearchCondition {
  public field: string;
  public operator: "equals" | "notEqual" | "notEquals" | "startsWith" | "endsWith" | "contains" | "greaterThan" | "greaterThanEqual" | "lessThan" | "lessThanEqual" | "in" | "notIn" | "lastDays";
  public value: string;
}
