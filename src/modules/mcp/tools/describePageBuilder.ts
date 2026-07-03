// Keep element-type catalog and answersJSON shapes in sync with B1Admin elementTypeMeta.ts and ElementEdit.tsx.

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

A Section can point at a Block via \`targetBlockId\` to inline a reusable block. An Element with \`elementType:"block"\` references a block via \`answers.targetBlockId\`.

## Section answers (backgrounds & shaped dividers)

A Section record carries its own \`answersJSON\` (parsed to \`answers\` on read). Beyond \`background\`/\`textColor\`, it supports:

- \`backgroundOpacity\` — 0-1 overlay opacity drawn over an image background.
- \`dividerTop\` / \`dividerBottom\` — a shaped SVG edge between sections: \`{ "shape":"wave|waves|slant|curve|triangle|peaks", "color":"#ffffff", "height":60, "flip":false }\`. \`color\` should match the ADJACENT section's background so the shape reads as a transition. \`height\` is px (default 60); \`flip\` mirrors horizontally.

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
- \`faq\` — Expandable Q&A. \`{ title, description:"<p>answer html</p>", headingType:"h6"|"link", iconColor }\`.
- \`iconFeature\` — A Material Icon above a short heading + blurb. \`{ icon:"volunteer_activism", title, description:"<p>...</p>", iconColor:"#03a9f4", iconSize:"small"|"medium"|"large", textAlignment:"center" }\`. \`icon\` is a Material Icons ligature name. Ideal in a \`row\` of 3-4 for "what to expect" / values / feature grids.
- \`testimonial\` — Member quotes. \`{ quotes:[{ text, author, role?, photoUrl? }], displayMode:"single"|"rotate" }\`. \`quotes\` is a native array (not stringified inside answersJSON). Use for member/visitor quotes.
- \`stats\` — Big-number highlights. \`{ items:[{ value:500, prefix?, suffix?:"+", label:"Members" }], columns:2|3|4 }\`. \`items\` is a native array; \`value\` is a number. Use for attendance/impact numbers.
- \`socialIcons\` — Row of social links. \`{ facebook, instagram, youtube, x, tiktok, vimeo, iconStyle:"filled"|"outlined", size:"small"|"medium"|"large", alignment:"left"|"center"|"right", color:"#444444" }\`. Only the URLs you set render.
- \`countdown\` — Countdown timer. \`{ mode:"weekly"|"date", dayOfWeek:0, time:"10:00", targetDate?, title, completedText:"Starting now!", showDays:"true", showHours:"true" }\`. \`weekly\` counts to the next dayOfWeek/time (Sunday=0); \`date\` counts to \`targetDate\` (ISO).
- \`table\` — \`{ contents:[["a","b"],["c","d"]], head:false, markdown:false, size:"medium"|"small" }\`. \`contents\` is a native 2D string array; set \`head:true\` to make the first row a header.

### Media
- \`image\` — \`{ photo:"https://...", photoAlt:"description" }\`.
- \`gallery\` — Photo grid. \`{ photos:[{ url, alt?, caption? }], layout:"grid"|"masonry"|"square"|"wide", columns:2|3|4, spacing:"small"|"medium"|"large" }\`. \`photos\` is a native array.
- \`video\` — \`{ videoType:"youtube"|"vimeo", videoId:"dQw4w9WgXcQ" }\` (just the id, not the full URL).
- \`map\` — \`{ mapAddress:"123 Main St", mapLabel:"Our Church", mapZoom:15 }\`.

### Church-specific
- \`logo\` — \`{ url:"https://..." }\` (link the logo points at).
- \`sermons\` — Sermon list. \`{ layout:"browse"|"grid"|"list"|"featuredLatest", playlistId?, itemCount:6, showTitles:"true", showDates:"true" }\`. \`browse\` (default) is the interactive playlist browser; \`grid\`/\`list\` render a flat set (respect \`itemCount\`/\`playlistId\`); \`featuredLatest\` is a single hero for the newest sermon.
- \`stream\` — \`{ mode:"video"|"interaction", offlineContent:"countdown"|"hide"|"block", targetBlockId? }\`.
- \`donation\` — Donation form.
- \`donateLink\` — Simple donate button.
- \`form\` — Embedded custom form. \`{ formId }\`.
- \`calendar\` — Calendar view.
- \`groupList\` — \`{ label:"Our Groups" }\`.
- \`campaignProgress\` — Live giving-goal thermometer. \`{ fundId, goalAmount:50000, title, startDate?, endDate?, showAmounts:"true", donateUrl? }\`. \`fundId\` must be a real GivingApi fund id — look it up; never invent one.
- \`staffGrid\` — Live staff/team photo cards from a group's roster. \`{ groupId, columns:2|3|4, showRoles:"true" }\`. \`groupId\` must be a real group with its "Show roster on website" (publicRoster) setting enabled, else nothing renders.
- \`serviceTimes\` — Live service schedule (also emits schema.org Event JSON-LD when day/time parse). \`{ title:"Service Times", showCampus:"true" }\`. Data comes from the church's attendance service times; no ids needed.

### Advanced
- \`rawHTML\` — **This is the "HTML block".** \`{ rawHTML:"<your html>", javascript:"/* optional, no <script> tag */" }\`. Use this whenever the user asks for an HTML block, custom embed, or hand-written markup.
- \`iframe\` — \`{ iframeSrc:"https://...", iframeHeight:"600" }\`.

### Reusable
- \`block\` — References an existing reusable block. \`{ targetBlockId:"<id of a Block>" }\`.

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
