# Multi-Gateway Provider Implementation Plan

## Current Implementation Snapshot
- **Shared abstractions**: `GatewayService` orchestrates provider calls via `GatewayFactory` and `IGatewayProvider` (optional customer/payment-method hooks already exist).
- **Providers in production**: `StripeGatewayProvider` is feature complete; `PayPalGatewayProvider` handles checkout/order flows but throws for customer/payment-method APIs.
- **Data storage**: `gateways` table stores a single record per church (`GatewayRepo` deletes buddies), `customers` table only persists an external id/person mapping, and payment methods are implicit (Stripe IDs).
- **Controllers**: `DonateController` selects the first configured gateway and drives most flows. Hard-coded fallbacks (e.g., ACH assumes Stripe) remain.
- **Helpers**: `PayPalHelper` focuses on Orders, Subscriptions, and Webhooks; Vault APIs are not implemented yet; `StripeHelper` already provides the full surface area.

## Guiding Principles
1. Maintain a provider-agnostic API surface across controllers and repos.
2. Assume one gateway per church; make the provider explicit in code paths so swapping Stripe → PayPal (or Square) is a configuration change, not a code edit.
3. Store provider-specific identifiers in dedicated tables/columns rather than overloading core tables.
4. Detect provider capabilities at runtime so UI/flows can toggle features without more branching.
5. Ship PayPal parity without regressing Stripe behaviour.

## Gaps To Close Before Adding More Providers
- **Implicit gateway selection**: `GatewayRepo.create` enforces the single-gateway rule by deleting other rows, and controllers just grab the first record. We need clearer helpers for loading the configured gateway and guardrails when changing providers.
- **Configuration parity**: `GatewayConfig` only exposes the Stripe-era trio (public/private/webhook keys + productId). PayPal already needs additional fields; future providers will need more.
- **Customer/payment-method storage**: `customers` table has no provider column and no generic payment-method storage, so adding Vault data is awkward.
- **Provider selection**: Controllers always take the first gateway; nothing chooses PayPal versus Stripe per request.
- **Logging/secrets**: `GatewayService.getGatewayConfig` logs decrypted secrets. We need to remove those logs while refactoring.
- **Capability detection**: No shared mechanism exists to flag which features (vault, ACH, subscriptions) each provider supports.

## Roadmap

### Phase 0: Alignment & Safeguards
- Remove secret logging in `GatewayService.getGatewayConfig` and add unit coverage to prevent regressions.
- Inventory current gateway usages (controllers, repos, cron) and document expected call paths for Stripe and PayPal.
- Document the single-gateway loading pattern we intend to use so controllers/services adopt it consistently.

### Phase 1: Foundation Hardening
1. **Database & models**
   - Keep one gateway row per church, but centralize gateway retrieval (e.g., `GatewayService.getGatewayForChurch`) and add guardrails for provider changes (validation, audit logging).
   - Add `provider` to `customers` (and a unique constraint on per-provider ids) so Stripe-era and PayPal-era identifiers don't collide when a church switches providers.
   - Introduce `gateway_payment_methods` (gatewayId, customerId, externalId, type, metadata JSON) to store PayPal vault references and future provider data.
   - Add encrypted JSON/blob column on `gateways` (e.g., `settings`) to hold provider-specific configuration like PayPal return URLs or Square location IDs without schema churn.
2. **Domain services**
   - Extend `GatewayConfig` to surface base keys plus typed `settings` per provider.
   - Update `GatewayService` to accept an explicit gateway identifier/provider so controllers can select the appropriate record.
   - Implement `GatewayService.getProviderCapabilities` returning supported features for UI/controllers.
3. **Controller updates**
   - Adjust `DonateController` (and any others) to rely on the centralized gateway loader instead of indexing the first row; ensure we surface meaningful errors when no provider is set.
   - Replace Stripe-specific fee fallbacks with capability-based logic (e.g., use provider's fee calculator when available, otherwise legacy types).

### Phase 2: PayPal Vault & Customer Parity
1. **Helper expansion**
   - Implement Vault REST helpers in `PayPalHelper` (token management already exists). Include create/read/update/delete for vault customers and payment sources, plus stored-payment charging.
   - Wrap PayPal plan creation/lookup so subscription workflows mirror Stripe.
2. **Provider implementation**
   - Replace the "not supported" throws in `PayPalGatewayProvider` with Vault-backed methods. Ensure `GatewayService` continues to work when optional methods are still undefined (feature-flag during rollout).
   - Use the new `gateway_payment_methods` table to persist vault IDs and link them to church/customer records.
3. **Data migration**
   - Populate `customers.provider="stripe"` for existing rows and migrate current PayPal payer IDs (if stored elsewhere) into the new structure.
   - Backfill gateway settings (e.g., move return/cancel URLs from code/config into the new JSON column).

### Phase 3: Additional Provider Readiness
1. **Provider SDK isolation**
   - Document and enforce a pattern for new providers: all external SDK calls live in `src/shared/helpers`, with thin `*GatewayProvider` wrappers.
   - Add integration tests (or contract tests) that exercise `IGatewayProvider` expectations using mock providers, ensuring new providers can be dropped in.
2. **Factory extensibility**
   - Expose a single registration point (already available via `GatewayFactory.registerProvider`) and add validation so duplicate names cannot be registered.
   - Consider lazy/dynamic imports if bundle size becomes a concern.
3. **Reference implementation**
   - Draft a "next provider" template (Square) outlining required config, capabilities, and test cases so contributors can follow a playbook.

### Phase 4: Testing & Observability
- Unit tests for `GatewayService`, `PayPalGatewayProvider`, and capability discovery across providers.
- Integration tests hitting sandbox environments (Stripe + PayPal) for charge, subscription, and webhook flows.
- Add structured logging around gateway operations (without secrets) and surface them via existing monitoring.
- Update smoke/regression suites to run against both providers.

### Phase 5: Rollout & Documentation
- Feature flag new PayPal customer/payment-method flows; enable per church once data migration completes.
- Update onboarding docs explaining how to configure and switch the active gateway, including provider capability matrices.
- Provide operational runbooks for dealing with provider-specific failures (webhook retries, vault issues).
- Communicate deprecation timelines for legacy PayPal-only endpoints.

## Success Metrics
1. Churches can switch the active provider (Stripe ↔ PayPal, future Square) via configuration only, with minimal downtime.
2. PayPal supports the same core features as Stripe (customers, stored methods, subscriptions, refunds/webhooks).
3. Adding a new provider requires only: implementing `IGatewayProvider`, adding helper APIs, and seeding configuration—no controller rewrites.
4. No cleartext secrets emitted in logs; vault operations succeed within existing latency/error budgets.
5. Automated tests cover the shared abstraction plus provider-specific happy paths.

## Risk Mitigation
- **Provider capability mismatches**: Gate keep new UX behind capability checks and surface clear error messages when a feature is unavailable.
- **Data migration risk**: Run migrations in read-only dry-run mode first and backfill audit tables for reconciliation.
- **API limits/performance**: Cache provider metadata (e.g., PayPal plan lists) where allowed and centralize retry/backoff.
- **Backward compatibility**: Maintain legacy controller paths behind feature flags until all churches migrate.
- **Compliance**: Review PCI implications of storing additional vault identifiers and ensure encryption-at-rest for new tables/columns.
