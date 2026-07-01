// A reminder occurrence in civil-local terms only. The engine never trusts the
// source time-of-day (it composes fireAt from the definition's sendLocalTime/tz),
// so adapters return civil dates, not instants (architecture §5.3).
export interface ReminderOccurrenceInfo {
  startLocalDate: string; // YYYY-MM-DD
  startLocalISO: string; // civil-local ISO, used in the occurrenceKey
}

export interface ReminderRecipient {
  personId: string;
  email?: string;
  displayName?: string;
  mobilePhone?: string;
  isDirectMention?: boolean;
}

// Per-entity strategy. The engine is entity-agnostic and never imports
// content/doing directly — it calls registered adapters which use gateways /
// dynamic imports for cross-module reads (architecture §6.2).
export interface ReminderAdapter {
  entityType: string; // 'event' | 'plan' | 'task'
  category: string; // preference category for this entity
  contentType: string; // push deep-link type
  loadEntity(churchId: string, entityId: string): Promise<any | null>;
  getOccurrences(entity: any, from: Date, to: Date): Promise<ReminderOccurrenceInfo[]>;
  loadRecipients(churchId: string, entity: any, occLocalISO: string, recipientMode: string): Promise<ReminderRecipient[]>;
  link(entity: any, occLocalISO: string): string;
  renderMessage?(entity: any, occLocalISO: string, custom?: string): string;
}

export class ReminderAdapterRegistry {
  private static adapters = new Map<string, ReminderAdapter>();

  static register(adapter: ReminderAdapter): void {
    ReminderAdapterRegistry.adapters.set(adapter.entityType, adapter);
  }

  static get(entityType: string): ReminderAdapter | undefined {
    return ReminderAdapterRegistry.adapters.get(entityType);
  }

  static has(entityType: string): boolean {
    return ReminderAdapterRegistry.adapters.has(entityType);
  }
}
