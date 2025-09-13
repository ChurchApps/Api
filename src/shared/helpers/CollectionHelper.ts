export class CollectionHelper {
  /**
   * Safely convert an array of rows using the provided converter.
   * Returns an empty array when input is null/undefined/non-array.
   */
  static convertAll<T>(data: any, convert: (row: any) => T): T[] {
    if (!Array.isArray(data)) return [];
    return data.map(convert);
  }
}

