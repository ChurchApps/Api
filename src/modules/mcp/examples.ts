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
    summary: "List all groups. Mixes People Groups, Ministries, and Teams — prefer GET /membership/groups/tag/:tag to filter.",
    responseSample: [
      { id: "g1", name: "Wednesday Bible Study", categoryName: "Adults", tags: "standard" },
      { id: "m1", name: "Wednesday Nights", categoryName: "Ministry", tags: "ministry" },
      { id: "t1", name: "Cubbies", categoryName: "m1", tags: "team" }
    ],
    notes: "One table, three record types via tags: 'standard' (People Group / community roster), 'ministry' (Serving Ministry), 'team' (volunteer unit under a Ministry). categoryName is a human Group Category for standard, typically 'Ministry' for ministries, and the parent Ministry id for teams. Discover with /tag/:tag before creating."
  },
  "GET /membership/groups/tag/:tag": {
    summary: "List groups filtered by tag. Use tag=standard|ministry|team.",
    responseSample: [{ id: "m1", name: "Wednesday Nights", categoryName: "Ministry", tags: "ministry" }],
    notes: "Preferred discovery before any Groups write. Call tag=ministry before creating a Team; tag=standard before creating a People Group. The same display name can correctly exist as Ministry, Team, Category, and Group — reuse rather than duplicate."
  },
  "POST /membership/groups": {
    summary: "Create or update groups. tags selects the record type.",
    requestBody: [
      { name: "Cubbies", categoryName: "Awana", tags: "standard", trackAttendance: true },
      { name: "Wednesday Nights", categoryName: "Ministry", tags: "ministry" },
      { name: "Cubbies", categoryName: "m1", tags: "team" }
    ],
    notes: "Set tags to 'standard', 'ministry', or 'team'. For teams, categoryName MUST be the parent Ministry id. For ministries, categoryName is typically 'Ministry'. For standard groups, categoryName is a human Group Category label — reuse an existing category when appropriate. Prefer GET /membership/groups/tag/:tag first. Deleting a ministry cascades delete of teams whose categoryName equals that ministry id. Do not auto-create both a Team and a People Group for the same activity."
  },

  "GET /membership/groupmembers": {
    summary: "List members of a group: ?groupId=g1",
    responseSample: [{ id: "gm1", groupId: "g1", personId: "abc123", leader: false }],
    notes: "Works for standard groups, ministries, and teams. Confirm the target group's tags first so membership lands on the correct record type."
  },
  "POST /membership/groupmembers": {
    summary: "Add or update group memberships. leader marks Group Leaders.",
    requestBody: [{ groupId: "g1", personId: "abc123", leader: false }],
    notes: "leader:true sets Group Leader on that membership. Apply membership to the correct record type (standard vs ministry vs team) — Team membership is not the same as community People Group membership. An activity may need both; create/link them deliberately."
  },

  "POST /content/events": {
    summary: "Create or update calendar events. Submit an array; omit id to create.",
    requestBody: [{ groupId: "g1", title: "Bible Study", start: "2026-09-02T18:00:00.000Z", end: "2026-09-02T19:30:00.000Z", allDay: false, visibility: "public" }],
    notes: "groupId MUST reference a standard People Group (tags contains 'standard'), never a Ministry or Team. Verify with GET /membership/groups/tag/standard (or GET by id) before writing. Reminders, RSVPs, and mobile deep-links treat groupId as a People Group membership graph."
  },
  "GET /content/events/group/:groupId": {
    summary: "List events for a group.",
    responseSample: [{ id: "e1", groupId: "g1", title: "Bible Study", start: "2026-09-02T18:00:00.000Z", end: "2026-09-02T19:30:00.000Z" }],
    notes: "Pass a standard People Group id. Use after POST /content/events to verify the event landed on the intended group."
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
