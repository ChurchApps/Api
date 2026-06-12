export type FilterNode =
  | { type: "group"; conjunction: "AND" | "OR"; children: FilterNode[] }
  | { type: "condition"; field: string; operator: string; value: string };

// Evaluates the inline JSON FilterNode tree (event-rule conditions) against a flat
// facts map. Shared by EventTriggerHelper (live events) and ExecutionHelper (run-now).
export class FilterMatcher {
  public static matches(facts: Record<string, any>, node: FilterNode | null): boolean {
    if (!node) return true;
    if (node.type === "group") {
      const children = node.children || [];
      if (children.length === 0) return true;
      return node.conjunction === "OR"
        ? children.some((c) => FilterMatcher.matches(facts, c))
        : children.every((c) => FilterMatcher.matches(facts, c));
    }
    const actual = facts[node.field];
    const test = (a: any) => FilterMatcher.compare(a, node.operator, node.value);
    return Array.isArray(actual) ? actual.some(test) : test(actual);
  }

  private static compare(actual: any, operator: string, value: string): boolean {
    const missing = actual === null || actual === undefined;
    switch (operator) {
      case "=": return !missing && String(actual) === String(value);
      case "!=": return missing || String(actual) !== String(value);
      case "contains": return !missing && String(actual).toLowerCase().includes(String(value).toLowerCase());
      case ">": return !missing && Number(actual) > Number(value);
      case "<": return !missing && Number(actual) < Number(value);
      case ">=": return !missing && Number(actual) >= Number(value);
      case "<=": return !missing && Number(actual) <= Number(value);
      case "in": return !missing && FilterMatcher.toList(value).includes(String(actual));
      case "notIn": return missing || !FilterMatcher.toList(value).includes(String(actual));
      default: return false;
    }
  }

  private static toList(value: string): string[] {
    return String(value || "").split(",").map((v) => v.trim()).filter(Boolean);
  }

  public static parseConditions(json?: string): FilterNode | null {
    if (!json) return null;
    try {
      const parsed = JSON.parse(json);
      return parsed && typeof parsed === "object" ? (parsed as FilterNode) : null;
    } catch {
      return null;
    }
  }

  // Collects the ids a "= / in" condition pins a field to (e.g. group.id) — used by
  // run-now to know which entity's current members to apply against.
  public static pinnedIds(node: FilterNode | null, field: string): string[] {
    if (!node) return [];
    if (node.type === "group") return (node.children || []).flatMap((c) => FilterMatcher.pinnedIds(c, field));
    if (node.field !== field) return [];
    if (node.operator === "=") return [node.value].filter(Boolean);
    if (node.operator === "in") return FilterMatcher.toList(node.value);
    return [];
  }

  // bit(1) columns can come back as Buffer / number / boolean depending on the driver.
  public static toBool(v: any): boolean {
    if (v === null || v === undefined) return true;
    if (Buffer.isBuffer(v)) return v[0] === 1;
    if (typeof v === "number") return v === 1;
    if (typeof v === "string") return v === "1" || v.toLowerCase() === "true";
    return !!v;
  }
}
