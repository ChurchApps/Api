import { v4 as uuidv4 } from "uuid";

export class UniqueIdHelper {
  static shortId(): string {
    return uuidv4().replace(/-/g, "").substring(0, 8);
  }

  static uuid(): string {
    return uuidv4();
  }

  static timestampId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}${random}`;
  }

  static churchScopedId(_churchId: string): string {
    const id = this.shortId();
    // Church scoping handled at database level
    return id;
  }

  static isMissing(value: any): boolean {
    return value === undefined || value === null || value === "";
  }
}
