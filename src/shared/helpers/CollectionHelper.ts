export class CollectionHelper {
  /** Returns empty array for null/undefined/non-array input. */
  static convertAll<T, R = unknown>(data: unknown, convert: (row: R) => T): T[] {
    if (!Array.isArray(data)) return [];
    return data.map(convert);
  }
}
