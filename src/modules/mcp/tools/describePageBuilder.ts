// Static, hand-written guide that teaches an LLM how to build B1App pages via
// the /content/* endpoints. The element-type catalog and answersJSON shapes
// mirror B1Admin/src/site/admin/elements/elementTypeMeta.ts and ElementEdit.tsx
// — keep them in sync when adding/removing element types or fields.

const GUIDE = `# B1App Page Builder Guide

Use this guide whenever you are creating or editing pages, sections, elements, or blocks via the \`/content/*\` endpoints. After reading it, drive everything with \`api_call\`.

## Data model

\`\`\`
Page          (url, title)
  └─ Section  (pageId, zone, background, textColor, sort)
      └─ Element              (sectionId, elementType, sort, answersJSON)
          └─ Element child    (parentId = parent element id; used for row→column, carousel→slide, box children)

Block         (blockType: sectionBlock | footerBlock | elementBlock)
  └─ Section  (blockId, ...)
      └─ Element ...
\`\`\`

A Section can point at a Block via \`targetBlockId\` to inline a reusable block. An Element with \`elementType:"block"\` references a block via \`answers.blockId\`.

\`churchId\` is **auto-set from the auth token** on every POST — do not pass it. All POST endpoints accept an **array** of records (omit \`id\` to create, include \`id\` to update).

## Standard workflow

1. \`POST /content/pages\` with \`[{ url:"/about", title:"About Us" }]\` → returns the saved page with its \`id\`.
2. \`POST /content/sections\` with \`[{ pageId, zone:"main", background:"#ffffff", textColor:"dark", sort:1 }]\` → returns the section with its \`id\`.
3. \`POST /content/elements\` with \`[{ sectionId, elementType, sort:1, answersJSON: JSON.stringify({...}) }]\` (one POST per element, or batch as an array).
4. \`GET /content/pages/:churchId/tree?url=/about\` → fetches the complete tree with **parsed** \`answers\`, \`styles\`, \`animations\` objects (the JSON strings are decoded for you on read).

You'll need the user's \`churchId\` for the tree endpoint. Get it from \`GET /membership/churches/my\` or any record you've already loaded.

## Writes vs reads

- **On write**: \`answersJSON\`, \`stylesJSON\`, \`animationsJSON\` must be **JSON strings** (not objects).
- **On read** (the tree endpoint): the API returns \`answers\`, \`styles\`, \`animations\` as parsed objects.

## Element types

\`elementType\` must be one of the values below. Each entry shows the \`answers\` object you would JSON.stringify into \`answersJSON\`.

### Layout
- \`section\` — Section grouping element (rare; sections are normally Section records, not elements).
- \`row\` — Grid container. \`{ columns:"6,6", mobileSizes?:"12,12", mobileOrder?:"0,1" }\`. **The API auto-creates \`column\` child elements to match \`columns\` — see the auto-creation note below.**
- \`column\` — Created automatically as a child of a \`row\`. **Never POST a \`column\` element yourself.** Put your content elements inside the row by setting their \`parentId\` to the auto-created column's \`id\`.
- \`box\` — Container. \`{ rounded:"true"|"false", translucent:"true"|"false" }\` (booleans are stored as **strings**).
- \`carousel\` — Slider. \`{ slides:3 }\` — auto-creates slide child elements just like rows auto-create columns.

### Content
- \`text\` — Rich text. \`{ text:"<p>hello</p>", textAlignment:"left"|"center"|"right" }\`. \`text\` is HTML (use \`<h1>\`, \`<p>\`, \`<a>\`, etc.).
- \`textWithPhoto\` — \`{ photo, photoAlt, photoPosition:"left"|"right"|"top"|"bottom", text, textAlignment }\`.
- \`card\` — \`{ photo, photoAlt, url, title, titleAlignment, text, textAlignment }\`.
- \`faq\` — Expandable Q&A.
- \`table\` — \`{ columns:"Name,Email", ... }\`.

### Media
- \`image\` — \`{ photo:"https://...", photoAlt:"description" }\`.
- \`video\` — \`{ videoType:"youtube"|"vimeo", videoId:"dQw4w9WgXcQ" }\` (just the id, not the full URL).
- \`map\` — \`{ mapAddress:"123 Main St", mapLabel:"Our Church", mapZoom:15 }\`.

### Church-specific
- \`logo\` — \`{ url:"https://..." }\` (link the logo points at).
- \`sermons\` — Sermon list (no required answers).
- \`stream\` — \`{ mode:"video"|"interaction", offlineContent:"countdown"|"hide"|"block", targetBlockId? }\`.
- \`donation\` — Donation form.
- \`donateLink\` — Simple donate button.
- \`form\` — Embedded custom form. \`{ formId }\`.
- \`calendar\` — Calendar view.
- \`groupList\` — \`{ label:"Our Groups" }\`.

### Advanced
- \`rawHTML\` — **This is the "HTML block".** \`{ rawHTML:"<your html>", javascript:"/* optional, no <script> tag */" }\`. Use this whenever the user asks for an HTML block, custom embed, or hand-written markup.
- \`iframe\` — \`{ iframeSrc:"https://...", iframeHeight:"600" }\`.

### Reusable
- \`block\` — References an existing reusable block. \`{ blockId:"<id of a Block>" }\`.

## Auto-creation gotchas

- POST a \`row\` with \`answersJSON: JSON.stringify({ columns:"6,6" })\` and the API will **create the two child \`column\` elements for you** (ElementController.checkRows). The save response includes the children with their generated ids.
- POST a \`carousel\` with \`{ slides:3 }\` and three slide children are created the same way.
- To put content inside a column or slide, set the content element's \`parentId\` to the auto-created child's \`id\` (from the row/carousel save response). Do **not** create \`column\` records yourself.

## Styles and animations

\`stylesJSON\` is a stringified \`{ all?, desktop?, mobile? }\` object; each breakpoint is a flat CSS prop map:

\`\`\`json
{ "all": { "background-color": "#fff", "padding": "10px" },
  "desktop": { "font-size": "18px" },
  "mobile":  { "font-size": "14px" } }
\`\`\`

\`animationsJSON\` is a stringified \`{ onShow:"fadeIn", onShowSpeed:"slow" }\`.

## Worked example — build /about with a heading, image, two-column row, and HTML block

\`\`\`
api_call POST /content/pages
  body: [{ "url":"/about", "title":"About Us" }]
  → returns [{ "id":"P1", "url":"/about", ... }]

api_call POST /content/sections
  body: [{ "pageId":"P1", "zone":"main", "background":"#ffffff", "textColor":"dark", "sort":1 }]
  → returns [{ "id":"S1", ... }]

api_call POST /content/elements
  body: [{ "sectionId":"S1", "elementType":"text", "sort":1,
           "answersJSON":"{\\"text\\":\\"<h1>About Us</h1>\\",\\"textAlignment\\":\\"center\\"}" }]
  → returns [{ "id":"E1", ... }]

api_call POST /content/elements
  body: [{ "sectionId":"S1", "elementType":"image", "sort":2,
           "answersJSON":"{\\"photo\\":\\"https://cdn.example/team.jpg\\",\\"photoAlt\\":\\"Our team\\"}" }]

api_call POST /content/elements
  body: [{ "sectionId":"S1", "elementType":"row", "sort":3,
           "answersJSON":"{\\"columns\\":\\"6,6\\"}" }]
  → returns [{ "id":"E_ROW", "elements":[
                { "id":"COL_L", "elementType":"column", ... },
                { "id":"COL_R", "elementType":"column", ... } ] }]

api_call POST /content/elements
  body: [{ "sectionId":"S1", "parentId":"COL_L", "elementType":"text", "sort":1,
           "answersJSON":"{\\"text\\":\\"<p>Left side</p>\\"}" },
         { "sectionId":"S1", "parentId":"COL_R", "elementType":"text", "sort":1,
           "answersJSON":"{\\"text\\":\\"<p>Right side</p>\\"}" }]

api_call POST /content/elements
  body: [{ "sectionId":"S1", "elementType":"rawHTML", "sort":4,
           "answersJSON":"{\\"rawHTML\\":\\"<div class=\\\\\\"hero\\\\\\">custom html</div>\\",\\"javascript\\":\\"\\"}" }]

api_call GET /content/pages/<churchId>/tree?url=/about   // verify
\`\`\`

## When you only need a quick edit

To tweak one element, GET it (\`GET /content/elements/:id\`), mutate the parsed \`answers\`, then POST it back with \`answersJSON\` re-stringified and the original \`id\` preserved.
`;

export const describePageBuilderSchema = {};

export async function describePageBuilderHandler() {
  return { content: [{ type: "text" as const, text: GUIDE }] };
}
