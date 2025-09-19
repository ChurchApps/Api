# Multi-Gateway Provider Implementation Plan

## Goal
Enable the donations stack to run on Stripe, PayPal, Square, or ePayMints (one gateway per church at a time) without controller rewrites, while keeping the architecture ready for future providers.

## Current Snapshot
- `GatewayService` + `GatewayFactory` abstract provider behaviour, but controllers still grab `gateways[0]` (DonateController, PaymentMethodController, CustomerController, SubscriptionController, GatewayController).
- `GatewayRepo` enforces a single row per church by deleting others, but there is no explicit helper for loading or swapping gateways.
- `Gateway` model only has `provider/publicKey/privateKey/webhookKey/productId/payFees`; there is no place for provider-specific settings.
- `Customer` records hold only external ids; PayPal payer ids and other provider data are not stored.
- PayPal implementation handles orders/webhooks but throws for customer/payment-method methods; Square/ePayMints providers do not exist yet.
- Secret logging was removed from `GatewayService.getGatewayConfig()` (✅ done).

## Capability Reference
| Feature | Stripe | PayPal | Square | ePayMints |
|---------|--------|--------|--------|-----------|
| One-time card payments | ✅ | ✅ | ✅ | ✅ |
| Stored payment methods / vault | ✅ | ⚠️ Vault API | ✅ | ❌ |
| Subscriptions | ✅ | ✅ (plans required) | ✅ | ⚠️ limited |
| ACH / bank | ✅ | ❌ | ✅ | ✅ |
| Webhooks | ✅ | ✅ | ✅ | ✅ |
| Multi-currency | ✅ | ✅ | ⚠️ USD-first | ⚠️ limited |

⚠️ = available but needs additional implementation work.

## Implementation Roadmap

### Phase 0 – Alignment & Guardrails
1. Catalogue every place we load a gateway and document the target helper (`GatewayService.getGatewayForChurch(churchId)`).
2. Agree on required secrets/settings per provider and capture them in a shared configuration table.
3. Define contract tests for the `IGatewayProvider` interface so new providers can be validated automatically.

### Phase 1 – Data Model & Migration
1. **Gateways table**
   - Add `settings` (JSON/text) for provider-specific configuration (Square locationId, PayPal returnUrl, ePayMints terminalId, etc.).
   - Add `environment` (VARCHAR) to track sandbox/production.
   - Add `updatedAt` timestamp column for auditability (existing `created` timestamps stay as-is or become `createdAt`).
   - Keep `publicKey/privateKey/webhookKey/productId` for Stripe compatibility; populate `settings` for new providers.
2. **Customers table**
   - Add `provider` column (VARCHAR) and optional `metadata` JSON so a church can retain historical identifiers during provider swaps.
   - Backfill existing rows with `provider='stripe'` (or `'paypal'` where applicable).
3. **Gateway payment methods**
   - Create `gatewayPaymentMethods` table (camelCase column names: `id`, `churchId`, `gatewayId`, `customerId`, `externalId`, `methodType`, `displayName`, `metadata`, `createdAt`, `updatedAt`) to store vault references across providers.
4. Write migration scripts with dry-run mode and data validation (ensure every church retains exactly one gateway row after migration).

### Phase 2 – Shared Services & Models
1. Update `src/modules/giving/models/Gateway.ts` to include `settings`, `environment`, timestamps.
2. Introduce a typed `GatewaySettings` interface (shared) with provider-specific namespaces (StripeSettings, PayPalSettings, etc.).
3. Add `GatewayService.getGatewayForChurch(churchId)` that returns the single configured gateway or throws a descriptive error.
4. Extend `GatewayService.getProviderCapabilities(gateway)` to surface supported features (`supportsVault`, `supportsACH`, `requiresPlans`, etc.).
5. Update `GatewayFactory` to lazily register Square and ePayMints providers via feature flags (`ENABLE_SQUARE`, `ENABLE_EPAYMINTS`).
6. Ensure decrypted secrets never get logged; add unit tests covering new service helpers.

### Phase 3 – Controller & Repository Updates
1. Replace all `gateways[0]` usage with the new `GatewayService.getGatewayForChurch` helper.
2. In controllers, branch behaviour based on capability flags instead of provider name (e.g., PaymentMethodController should bail gracefully if `supportsVault` is false).
3. Update `GatewayController` to include new settings fields when creating/updating gateways and validate provider requirements.
4. Move legacy fee calculations behind capability checks; rely on provider-specific `calculateFees` when available.

### Phase 4 – Provider Implementations
1. **PayPal**
   - Implement Vault customer+payment-method flows in `PayPalHelper` (create/list/update/delete) and wire them through `PayPalGatewayProvider`.
   - Use `gateway_payment_methods` to persist PayPal vault IDs.
   - Support subscription plan creation/lookups for dynamic amounts.
2. **Square**
   - Add `SquareHelper` to encapsulate API calls (customer management, payments, webhooks, subscriptions where supported).
   - Implement `SquareGatewayProvider` satisfying `IGatewayProvider` (respect capability map: ACH, vault, subscriptions).
   - Store Square-specific config (locationId, applicationId) in `Gateway.settings`.
3. **ePayMints**
   - Create `EPayMintsHelper` with REST/SOAP integration (depending on API) for tokenised payments and ACH.
   - Implement `EPayMintsGatewayProvider`; mark unsupported features (`supportsSubscriptions=false`, etc.).
4. Ensure each provider sets meaningful errors for unsupported flows so controllers can relay clear messaging.

### Phase 5 – Testing & Observability
1. Unit-test helpers and providers with mocked SDK clients.
2. Add integration tests hitting Stripe & PayPal sandbox; create contract tests for Square/ePayMints using recorded fixtures where live sandboxes are unavailable.
3. Verify webhook signature flows end-to-end for each provider.
4. Add structured logs around provider calls (request id, provider, operation, success/failure) without leaking secrets.

### Phase 6 – Rollout & Enablement
1. Ship schema migrations and shared-service updates behind feature flags; confirm Stripe regression tests pass.
2. Enable PayPal vault functionality for pilot churches, followed by Square/ePayMints once validated.
3. Update onboarding documentation with provider-specific setup steps, required environment variables, and capability matrices.
4. Train support on switching providers (data migration checklist, how to rotate secrets, what features differ).

## Dependencies & Configuration
- Add SDK packages: `@paypal/checkout-server-sdk` (already used), `square` (latest), ePayMints client (REST wrapper or custom implementation), ensure versions pinned.
- Environment variables per provider (client IDs, secrets, location IDs, terminal IDs, feature flags): add to `.env` template and deployment manifests.

## Success Metrics
1. Churches can switch providers via configuration changes only (no code edits, outage < 5 minutes).
2. Stripe functionality remains unchanged post-migration.
3. PayPal vault flows reach parity with Stripe (create/update/list payment methods, subscriptions).
4. Square/ePayMints support one-time payments and respect feature capability flags.
5. Automated tests cover at least one happy path per provider and provider capability detection.

## Risks & Mitigations
- **Migration fallout**: run migrations in staging with production-sized data; keep rollback scripts and backups.
- **API limits/latency**: centralise retry/backoff in helpers; add metrics to monitor response times per provider.
- **Partial capability coverage**: gate new UI/flows behind capability checks and communicate unsupported features via error responses.
- **Security/compliance**: ensure new tables/columns leverage encryption-at-rest and do not store raw PAN data; review PCI scope before go-live.

## Timeline (Guideline)
- Weeks 1–2: Phases 1 & 2 (schema, services, tests for existing providers).
- Weeks 3–4: Phase 3 controller updates + PayPal vault parity.
- Weeks 5–6: Implement & test Square and ePayMints providers.
- Weeks 7–8: Phase 5/6 testing, documentation, rollout.

## Immediate Next Steps
1. Finalise migration scripts (Phase 1) and review with DBA.
2. Prepare `GatewayService` helper refactor PR (Phase 2).
3. Draft PayPal Vault helper implementation outline and integration tests (Phase 4.1).
