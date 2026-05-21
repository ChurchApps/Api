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
  },

  "GET /content/pages/:churchId/tree": {
    summary: "Load a fully populated page tree (sections + nested elements) for display. Pass ?url=/about or ?id=<pageId>. Returns parsed answers/styles/animations objects (not JSON strings).",
    notes: "Use this to verify a page after creating it, or to read the current structure before editing."
  },
  "POST /content/pages": {
    summary: "Create or update pages. Submit an array; omit id to create, include id to update.",
    requestBody: [{ url: "/about", title: "About Us" }],
    notes: "churchId is auto-set from auth. For building page content (sections, elements, HTML blocks, etc.) call describe_page_builder for the full data model and elementType catalog."
  },
  "POST /content/sections": {
    summary: "Create or update sections (children of a page or block).",
    requestBody: [{ pageId: "P1", zone: "main", background: "#ffffff", textColor: "dark", sort: 1 }],
    notes: "Provide pageId OR blockId, not both. zone is typically 'main' (page body) or 'siteFooter'."
  },
  "POST /content/elements": {
    summary: "Create or update elements inside a section (or a block, or as a child of another element).",
    requestBody: [{ sectionId: "S1", elementType: "rawHTML", sort: 1, answersJSON: "{\"rawHTML\":\"<h1>Hello</h1>\",\"javascript\":\"\"}" }],
    notes: "Call describe_page_builder for the full elementType catalog (text, image, video, rawHTML, row, etc.) and the answers shape for each. answersJSON must be a JSON STRING on write. For nested children (inside a row column or carousel slide) set parentId to the auto-created child's id. Never POST elementType:'column' yourself — rows create columns automatically."
  },
  "POST /content/blocks": {
    summary: "Create or update reusable blocks (sectionBlock, footerBlock, elementBlock).",
    requestBody: [{ blockType: "sectionBlock", name: "Reusable Hero" }],
    notes: "After saving the block, add Sections with blockId=<this block's id>, then Elements inside those Sections. Reference the block from a Section via targetBlockId, or from an Element via elementType:'block' with answersJSON:'{\"blockId\":\"...\"}'."
  }
};

export function lookupExample(method: string, path: string): EndpointExample | undefined {
  return EXAMPLES[method.toUpperCase() + " " + path];
}
