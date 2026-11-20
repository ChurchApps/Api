// Slack and Discord expect different message formats; standard uses raw envelope.

export interface WebhookEnvelope {
  event: string;
  churchId: string;
  occurredAt: string;
  data: unknown;
}

interface PersonNameParts {
  display?: string;
  first?: string;
  last?: string;
}

// Fields describeEvent reads. "name" is a string for groups and households and an object for people.
interface WebhookEventData {
  name?: string | PersonNameParts;
  personName?: string;
  groupName?: string;
  formName?: string;
  title?: string;
  amount?: unknown;
  currency?: string;
}

export function describeEvent(envelope: WebhookEnvelope): string {
  const d = (envelope.data ?? {}) as WebhookEventData;
  switch (envelope.event) {
    case "person.created": return `👤 New person added: ${personName(d)}`;
    case "person.updated": return `👤 Person updated: ${personName(d)}`;
    case "person.destroyed": return "👤 A person was removed";
    case "group.created": return `👥 New group created: ${d.name ?? "(unnamed)"}`;
    case "group.updated": return `👥 Group updated: ${d.name ?? "(unnamed)"}`;
    case "group.destroyed": return "👥 A group was removed";
    case "group.member.added": return `➕ ${d.personName ?? "Someone"} was added to ${d.groupName ?? "a group"}`;
    case "group.member.removed": return `➖ ${d.personName ?? "Someone"} was removed from ${d.groupName ?? "a group"}`;
    case "household.created": return `🏠 New household: ${d.name ?? "(unnamed)"}`;
    case "household.updated": return `🏠 Household updated: ${d.name ?? "(unnamed)"}`;
    case "household.destroyed": return "🏠 A household was removed";
    case "donation.created": return `💝 New donation: ${formatAmount(d)}${d.personName ? ` from ${d.personName}` : ""}`;
    case "donation.updated": return `💝 Donation updated: ${formatAmount(d)}${d.personName ? ` from ${d.personName}` : ""}`;
    case "attendance.recorded": return `✅ Attendance recorded${d.personName ? ` for ${d.personName}` : ""}`;
    case "session.created": return `📋 New attendance session created${d.groupName ? ` for ${d.groupName}` : ""}`;
    case "form.submission.created": return `📝 New form submission received${d.formName ? `: ${d.formName}` : ""}`;
    case "event.created": return `📅 New event: ${d.title ?? "(untitled)"}`;
    case "event.updated": return `📅 Event updated: ${d.title ?? "(untitled)"}`;
    case "event.destroyed": return "📅 An event was removed";
    default: return `🔔 ${envelope.event}`;
  }
}

function personName(d: WebhookEventData): string {
  const name = d?.name as PersonNameParts | undefined;
  return name?.display || [name?.first, name?.last].filter(Boolean).join(" ") || "(unnamed)";
}

function formatAmount(d: WebhookEventData): string {
  if (typeof d?.amount !== "number") return "(amount unknown)";
  const currency = (d.currency ?? "USD").toUpperCase();
  return currency === "USD" ? `$${d.amount.toFixed(2)}` : `${d.amount.toFixed(2)} ${currency}`;
}

export function formatForConnector(connectorType: string | undefined, envelope: WebhookEnvelope): string {
  switch (connectorType) {
    case "slack": return JSON.stringify({ text: describeEvent(envelope) });
    case "discord": return JSON.stringify({ content: describeEvent(envelope) });
    default: return JSON.stringify(envelope);
  }
}
