// Hand-curated request/response examples for the highest-traffic routes. The
// describe_endpoint MCP tool returns these so the LLM can build correct
// payloads without an OpenAPI spec. For un-curated routes, describe_endpoint
// falls back to "call GET first to see the shape".

export interface EndpointExample {
  summary: string;
  requestBody?: any;
  responseSample?: any;
  notes?: string;
}

// Keyed by "METHOD path" (path matches the inventory path verbatim).
export const EXAMPLES: Record<string, EndpointExample> = {
  "GET /membership/people": {
    summary: "List people in the current church. Supports ?firstName=, ?lastName=, ?email= filters.",
    responseSample: [{ id: "abc123", firstName: "Jane", lastName: "Doe", contactInfo: { email: "jane@example.com" } }]
  },
  "GET /membership/people/:id": {
    summary: "Get a single person by id.",
    responseSample: { id: "abc123", firstName: "Jane", lastName: "Doe", householdId: "hh1" }
  },
  "POST /membership/people": {
    summary: "Create or update people. Submit an array; missing id = create, present id = update.",
    requestBody: [{ firstName: "Jane", lastName: "Doe", contactInfo: { email: "jane@example.com", mobilePhone: "555-1234" } }]
  },
  "POST /membership/people/search": {
    summary: "Search people by SearchCondition array (field/operator/value).",
    requestBody: [{ field: "lastName", operator: "contains", value: "Smith" }]
  },

  "GET /membership/groups": {
    summary: "List groups in the current church.",
    responseSample: [{ id: "g1", name: "Wednesday Bible Study", categoryName: "Adults" }]
  },
  "POST /membership/groups": {
    summary: "Create or update groups.",
    requestBody: [{ name: "New Group", categoryName: "Adults", trackAttendance: true }]
  },

  "GET /membership/groupmembers": {
    summary: "List members of a group: ?groupId=g1",
    responseSample: [{ id: "gm1", groupId: "g1", personId: "abc123", leader: false }]
  },
  "POST /membership/groupmembers": {
    summary: "Add or update group memberships.",
    requestBody: [{ groupId: "g1", personId: "abc123", leader: false }]
  },

  "GET /attendance/attendance": {
    summary: "Attendance records. Use query params like ?campusId=, ?serviceId=, ?serviceTimeId=.",
    responseSample: [{ id: "a1", personId: "abc123", visitDate: "2026-05-17" }]
  },
  "POST /attendance/visits": {
    summary: "Record a visit (check-in). Submit an array of Visit objects.",
    requestBody: [{ personId: "abc123", serviceId: "svc1", visitDate: "2026-05-17", visitSessions: [{ sessionId: "ses1" }] }]
  },

  "GET /giving/donations": {
    summary: "List donations in the current church. Filter via ?personId=, ?batchId=, ?startDate=, ?endDate=.",
    responseSample: [{ id: "d1", personId: "abc123", amount: 100, donationDate: "2026-05-01", method: "Cash" }]
  },
  "POST /giving/donations": {
    summary: "Create or update donations.",
    requestBody: [{ personId: "abc123", amount: 100, donationDate: "2026-05-01", method: "Cash", fundDonations: [{ fundId: "f1", amount: 100 }] }]
  },
  "GET /giving/funds": {
    summary: "List funds (donation designations).",
    responseSample: [{ id: "f1", name: "General Fund" }]
  }
};

export function lookupExample(method: string, path: string): EndpointExample | undefined {
  return EXAMPLES[method.toUpperCase() + " " + path];
}
