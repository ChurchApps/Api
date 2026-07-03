export class CollectionHelper {
  /** Returns empty array for null/undefined/non-array input. */
  static convertAll<T>(data: any, convert: (row: any) => T): T[] {
    if (!Array.isArray(data)) return [];
    return data.map(convert);
  }
}
