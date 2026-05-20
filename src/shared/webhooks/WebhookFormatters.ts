// Connector-specific formatting for outbound webhook deliveries.
//
// A `standard` webhook receives the raw {event,churchId,occurredAt,data}
// envelope. Slack and Discord incoming webhooks instead expect a small
// message object ({text} / {content}), so for those connector types the
// delivery worker sends a human-readable summary built from the event + data.

export interface WebhookEnvelope {
  event: string;
  churchId: string;
  occurredAt: string;
  data: any;
}

// Builds a one-line human-readable summary of an event for chat connectors.
export function describeEvent(envelope: WebhookEnvelope): string {
  const d = envelope.data ?? {};
  switch (envelope.event) {
    case "person.created": return `👤 New person added: ${personName(d)}`;
    case "person.updated": return `👤 Person updated: ${personName(d)}`;
    case "person.destroyed": return "👤 A person was removed";
    case "group.created": return `👥 New group created: ${d.name ?? "(unnamed)"}`;
    case "group.updated": return `👥 Group updated: ${d.name ?? "(unnamed)"}`;
    case "group.destroyed": return "👥 A group was removed";
    case "group.member.added": return "➕ Someone was added to a group";
    case "group.member.removed": return "➖ Someone was removed from a group";
    case "household.created": return `🏠 New household: ${d.name ?? "(unnamed)"}`;
    case "household.updated": return `🏠 Household updated: ${d.name ?? "(unnamed)"}`;
    case "household.destroyed": return "🏠 A household was removed";
    case "donation.created": return `💝 New donation: ${formatAmount(d)}`;
    case "donation.updated": return `💝 Donation updated: ${formatAmount(d)}`;
    case "attendance.recorded": return "✅ Attendance recorded";
    case "session.created": return "📋 New attendance session created";
    case "form.submission.created": return "📝 New form submission received";
    case "event.created": return `📅 New event: ${d.title ?? "(untitled)"}`;
    case "event.updated": return `📅 Event updated: ${d.title ?? "(untitled)"}`;
    case "event.destroyed": return "📅 An event was removed";
    default: return `🔔 ${envelope.event}`;
  }
}

function personName(d: any): string {
  return d?.name?.display || [d?.name?.first, d?.name?.last].filter(Boolean).join(" ") || "(unnamed)";
}

function formatAmount(d: any): string {
  if (typeof d?.amount !== "number") return "(amount unknown)";
  const currency = (d.currency ?? "USD").toUpperCase();
  return currency === "USD" ? `$${d.amount.toFixed(2)}` : `${d.amount.toFixed(2)} ${currency}`;
}

/**
 * Returns the request body string to deliver for a given connector type.
 * `standard` (and any unknown type) returns the raw envelope JSON; `slack`
 * and `discord` return their respective message JSON.
 */
export function formatForConnector(connectorType: string | undefined, envelope: WebhookEnvelope): string {
  switch (connectorType) {
    case "slack": return JSON.stringify({ text: describeEvent(envelope) });
    case "discord": return JSON.stringify({ content: describeEvent(envelope) });
    default: return JSON.stringify(envelope);
  }
}
