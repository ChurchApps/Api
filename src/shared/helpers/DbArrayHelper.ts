/**
 * Normalize various DB client return shapes to a plain array of rows.
 * - If input is already an array, returns it.
 * - If input has a `rows` array (e.g., pg), returns that.
 * - Otherwise returns an empty array.
 */
export function rowsToArray<T = any>(result: any): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && Array.isArray(result.rows)) return result.rows as T[];
  return [] as T[];
}
