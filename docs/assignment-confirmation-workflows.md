# Serving assignment confirmation workflows

This is an opt-in use of the existing workflow builder, cards, actions, routing, and timer. It follows an individual serving request until the volunteer accepts or declines. It does not change staffing selection or ordinary service-time reminder definitions.

## Configure and issue

1. In Serving → Workflows, create **Serving Assignment Confirmation** from the template. Alternatively create a blank workflow with purpose **Serving assignment confirmation**.
2. Edit its actions, waits, person-based routing, and human step default assignee. The template attempts an initial email and an eligible text, waits two days, sends a follow-up email, waits one day, and routes into a call card due in one day. The call is a human task; this feature does not place calls. If a human step has no assignee, the first ministry leader is used, falling back to the ministry team's shared queue.
3. In a plan's settings select this confirmation workflow. Save the plan and assignments. Penciled-in plans remain hidden and send nothing.
4. Publish the plan and use **Notify**. This invokes `POST /doing/plans/:id/issueRequests` for new Unconfirmed assignments which have not already been notified. Publication or a generic save alone does not send. Copying/importing/autofilling does not enroll or contact anyone. Existing notified requests are deliberately not backfilled.
5. Inspect the workflow board for each assignment's role, plan, date, and delivery/activity history. Two roles or services for the same person have independent cards. The default sequence is editable; nothing is installed or enabled automatically for existing churches.

The existing app alert remains, including the member's permitted push delivery. For workflow-managed requests it does not escalate into unread-email notifications; the workflow owns confirmation email and text. Reading that alert never closes the confirmation case.

## Messages and human work

Use **Send serving request** with channel `email` or `sms`. It includes the current role, plan, date and response link. Email also uses the existing signed Accept/Decline confirmation links when signing is configured. New confirmation tokens bind the person, role, plan and civil service date; a stale link cannot answer a reassigned/rescheduled request. Legacy reminder tokens remain supported. Optional message fields support `{{planName}}`, `{{positionName}}`, and `{{serviceDate}}`. Member preferences and serving-category overrides apply. SMS requires explicit `allowSms` opt-in, no person opt-out, a mobile phone, and the church's existing provider. No provider account is created. Email passes through the notification funnel's membership check, preference gate, church approval, allowance reservation and delivery log.

Missing providers, suppressed channels and blocked email attempts are recorded on the card. They do not silently fall back to another channel or discard the case. These attempts are not automatically resent; later configured steps and human review remain available. Generic Send Text / Send Email actions are rejected for confirmation workflows at configuration and runtime, because their separate queues are not bound to a serving response. Workflow handoffs are also blocked to preserve request identity. Ordinary person workflows keep their current behavior.

A board step itself can be a call/follow-up task with default assignee, due date, contact details and notes. `createTask` can additionally create a standalone linked FollowUp task with an assignee, description and `dueDays`. A volunteer's response closes open tasks linked to that case. Completing a standalone task records that human activity. Completing the confirmation card records the follow-up as done and keeps the card Open, assigned and waiting until its follow-up deadline; it does not change the volunteer's assignment to Accepted. Skip and manual moves also retain the open case.

Configuring workflows requires Tasks Admin. Configuring a serving SMS action or creating the SMS-containing starter template also requires Texting Send. Issuing an already configured policy requires permission to edit the plan or its ministry. All IDs are resolved in the authenticated church.

## Completion, expiry and reminders

Before each action, wake, route or human move, the runtime reads the current assignment, position, plan and workflow. Accepted or Declined closes that case and its linked tasks; it does not close other requests for the person. Signed-in replies, signed email replies, administrative updates and removals publish lifecycle events. The existing 30-minute workflow timer repairs missed starts/events and checks cards waiting on people as well as delayed cards.

When relevant service times exist, confirmation expiry follows the assigned-volunteer member view: the latest `endTime` (or `startTime` when there is no end) among times matching the position's category. `signupDeadlineHours` applies to self-signup/removal and is not used for assigned confirmation. At the boundary no further automated action runs. With no usable relevant time, the workflow uses the end of the plan's civil service day in the church timezone as an explicit safety expiry. That fallback only ends automation; it does not change the assignment response endpoints or staffing status.

There is a pre-existing UI/server mismatch: assigned response endpoints do not enforce a shared time cutoff, the member view hides controls after the relevant boundary (and leaves them available when there are no relevant times), and legacy reminder tokens expire the day after service. This feature does not introduce a global server response policy or alter those legacy tokens. Its new confirmation tokens expire with the follow-up window. A future shared response policy would require a separate, coordinated change.

If the follow-up deadline passes unanswered, the card closes with **Response deadline passed** and one due standalone review task is assigned to the current coordinator or ministry leader/team. The assignment remains Unconfirmed, so expiry cannot masquerade as acceptance or covered staffing. That exception stays available for a human coverage decision even if a late response is subsequently recorded.

Removal, returning the plan to draft, changing the request's person/role/plan/service date, changing the selected workflow, or disabling/removing its workflow safely closes obsolete confirmation work. A closed case is never reopened by another Notify. To issue a genuinely new request, create a new assignment. Manual card completion never silently drops an unanswered case: it records the human work while keeping the owned case open for response/deadline review.

For an issued, workflow-bound request, native service-time reminders include **Accepted** assignments and exclude **Unconfirmed** and **Declined** assignments. This avoids overlapping confirmation nudges. Unbound legacy requests retain Accepted + Unconfirmed behavior. Draft plans are suppressed. Disabling a confirmation policy does not silently restart legacy nudges for its previously issued requests; those still need a response or coordinator decision. Normal decline replacement continues independently; each replacement assignment on a published opted-in plan is issued as a new case.

## Durability and delivery limits

The assignment's server-owned workflow binding is persisted before card creation. Ordinary saves cannot forge or clear it. A unique `(churchId, followupKey)` and a per-assignment MySQL advisory lock prevent duplicate cards/concurrent execution across API/timer processes. Repository calls reuse the locked connection through the Doing module's async connection context, including Lambda's two-connection pool. The timer repairs a start that failed after binding. Closed cards cannot be reopened by stale saves.

Each non-delay action is checkpointed before its side effect, and the existing delay cursor resumes the remaining actions. After an uncertain transport result or process crash, that action is not replayed automatically: its card history directs a coordinator to inspect delivery history. This favors avoiding duplicate outreach over pretending to guarantee exactly-once email/SMS delivery. A delivery already in progress when a response is saved cannot be recalled; every subsequent action checks the live response. The feature creates no delayed messaging queue that can outlive the assignment response.

## API / MCP

The existing MCP endpoint inventory discovers the controllers; curated `describe_endpoint` examples cover configuration and issuance. No separate scheduler, agent or MCP service is needed.

- `POST /doing/workflows/fromTemplate` — `{ "templateKey": "assignmentConfirmation" }`
- `GET /doing/plans/confirmationWorkflows?ministryId=...` — available active policies for a plan editor
- `POST /doing/plans` — existing plan save; set `confirmationWorkflowId` to select a policy or null to opt out for future requests; read and preserve the rest of the plan
- `POST /doing/plans/:id/issueRequests` — explicit issuance command, empty body
- `GET /doing/tasks/board/:workflowId` — card context/history, existing board
- Existing workflow action, step, route, task, and assignment response endpoints remain in use

## Rollout and local validation

Apply Doing migration `2026-10-22_assignment_confirmation_workflows`, then deploy the API, then B1Admin. The additive migration and fields require no shared Packages release. Existing clients/churches remain on the legacy notification path until they deliberately select and issue through a confirmation policy. Removing the feature requires disabling/finishing active cases before rolling back its migration; down preserves task/assignment records but removes their binding fields.

Focused tests use synthetic people and delivery adapters. The opt-in MySQL integration suite runs the real migration, repositories, advisory lock, unique fence, default sequence, reminder eligibility and migration down/up against a hard-coded disposable database on localhost:

```sh
# Disposable container; no real credentials or records
# Bind only localhost; stop/remove after verification.
docker run --name churchapps-confirmation-test --rm -d -e MYSQL_ALLOW_EMPTY_PASSWORD=yes -p 127.0.0.1:33307:3306 mysql:8.0
CONFIRMATION_TEST_MYSQL=1 CONFIRMATION_TEST_PORT=33307 yarn exec jest --runInBand --coverage=false AssignmentConfirmationDatabase
docker stop churchapps-confirmation-test
```

No production church records or live delivery providers are used in these tests.
