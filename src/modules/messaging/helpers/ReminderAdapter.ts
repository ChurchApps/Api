// Reminder occurrence in civil-local terms only (architecture §5.3). Adapters return civil dates, not instants; engine composes fireAt from definition's sendLocalTime/tz.
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

// What the engine itself reads off an entity; each adapter narrows it to its own row type.
export interface ReminderEntity {
  id?: string;
  churchId?: string;
}

// Entity-agnostic engine (§6.2) calls registered adapters for cross-module reads via gateways/dynamic imports; no direct content/doing imports.
export interface ReminderAdapter<E extends ReminderEntity = ReminderEntity> {
  entityType: string; // 'event' | 'plan' | 'task'
  category: string; // preference category for this entity
  contentType: string; // push deep-link type
  loadEntity(churchId: string, entityId: string): Promise<E | null>;
  getOccurrences(entity: E, from: Date, to: Date): Promise<ReminderOccurrenceInfo[]>;
  loadRecipients(churchId: string, entity: E, occLocalISO: string, recipientMode: string): Promise<ReminderRecipient[]>;
  link(entity: E, occLocalISO: string): string;
  renderMessage?(entity: E, occLocalISO: string, custom?: string, recipientMode?: string): string | Promise<string>;
  buildEmails?(entity: E, occLocalISO: string, recipients: ReminderRecipient[], custom?: string, recipientMode?: string): Promise<Record<string, { subject: string; html: string }> | null>;
  // Scope inheritance (entityId null, scopeId set): concrete entities a scoped definition fans out to in the window (e.g., every plan of a planType).
  loadScopeEntities?(churchId: string, scopeId: string, from: Date, to: Date): Promise<E[]>;
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
