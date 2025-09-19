# Phase 0 Analysis - Gateway Usage Inventory & Call Paths

## Gateway Usage Inventory

### Controllers Using GatewayService

**Primary Controllers (Direct Gateway Usage):**
1. **DonateController** (`src/modules/giving/controllers/DonateController.ts`)
   - Lines 29, 61, 112, 168, 201: `const gateway = gateways[0];`
   - Uses GatewayService for: charge processing, subscriptions, webhooks, client tokens, order creation

2. **PaymentMethodController** (`src/modules/giving/controllers/PaymentMethodController.ts`)
   - Lines 25, 42, 97, 124, 163, 182, 201: `const gateway = gateways[0];`
   - Uses GatewayService for: customer management, payment method operations

3. **CustomerController** (`src/modules/giving/controllers/CustomerController.ts`)
   - Line 41: `const gateway = gateways[0];`
   - Uses GatewayService for: customer operations

4. **SubscriptionController** (`src/modules/giving/controllers/SubscriptionController.ts`)
   - Uses GatewayService for: subscription management

5. **GatewayController** (`src/modules/giving/controllers/GatewayController.ts`)
   - Gateway configuration and webhook management

### Repository Layer
- **GatewayRepo** (`src/modules/giving/repositories/GatewayRepo.ts`)
  - Enforces single-gateway rule: deletes existing gateways when creating new ones (line 20)
  - Uses `loadAll()` method that controllers access via `gateways[0]` pattern

### Timer/Scheduled Tasks
- **No direct gateway usage found** in timer handlers or scheduled tasks
- Timer functions focus on notifications and service reminders, not payment processing

## Current Gateway Loading Pattern

**Consistent Pattern Across All Controllers:**
```typescript
const gateways = (await this.repos.gateway.loadAll(churchId)) as any[];
const gateway = gateways[0];  // Always takes first (and only) gateway
```

**Issues with Current Pattern:**
1. **No null checks** - assumes gateway exists
2. **No provider validation** - assumes first gateway is correct
3. **Hard-coded indexing** - brittle `gateways[0]` pattern
4. **No error handling** for missing gateways in some paths

## Expected Call Paths - Stripe vs PayPal

### Stripe Call Paths

**One-time Donations:**
1. Client → `POST /giving/donate/charge`
2. DonateController → GatewayService.processCharge()
3. GatewayService → StripeGatewayProvider.processCharge()
4. Webhook: Stripe → `POST /giving/donate/webhook/stripe?churchId={id}`
5. DonateController → GatewayService.verifyWebhook() → GatewayService.logDonation()

**Recurring Subscriptions:**
1. Client → `POST /giving/donate/subscribe`
2. DonateController → GatewayService.createSubscription()
3. GatewayService → StripeGatewayProvider.createSubscription()
4. Webhook: Stripe → `POST /giving/donate/webhook/stripe?churchId={id}` (invoice.paid)

**Customer Management:**
1. Client → PaymentMethodController/CustomerController endpoints
2. Controller → GatewayService.createCustomer() / getCustomerPaymentMethods()
3. GatewayService → StripeGatewayProvider methods

### PayPal Call Paths

**One-time Donations:**
1. Client → `POST /giving/donate/create-order` (optional, for PayPal orders)
2. Client → `POST /giving/donate/charge` (with PayPal payment token)
3. DonateController → GatewayService.processCharge()
4. GatewayService → PayPalGatewayProvider.processCharge()
5. **Direct logging** (line 181-182): PayPal donations log immediately, not via webhook
6. Webhook: PayPal → `POST /giving/donate/webhook/paypal?churchId={id}` (PAYMENT.CAPTURE.COMPLETED)

**Recurring Subscriptions:**
1. Client → `POST /giving/donate/subscribe`
2. DonateController → GatewayService.createSubscription()
3. GatewayService → PayPalGatewayProvider.createSubscription()
4. Webhook: PayPal → subscription events (BILLING.SUBSCRIPTION.*)

**Customer Management:**
1. Currently **throws errors** - PayPalGatewayProvider doesn't implement customer/vault methods
2. Future: Will use PayPal Vault APIs for stored payment methods

### Key Differences in Implementation

**Stripe:**
- Webhook-driven donation logging
- Full customer/payment method support
- Synchronous charge processing

**PayPal:**
- Hybrid: immediate logging + webhook confirmation (DonateController lines 180-183)
- Limited customer management (throws "not supported" errors)
- Order-based flow for some scenarios

## Issues Identified

### 1. Hard-coded Gateway Selection
**Problem:** Every controller uses `gateways[0]` with no validation
**Locations:** 13+ occurrences across giving controllers
**Risk:** Fails silently if no gateway configured

### 2. Missing Provider-Specific Logic
**Problem:** Controllers don't distinguish between Stripe and PayPal capabilities
**Example:** PaymentMethodController calls methods that PayPal doesn't support

### 3. Inconsistent Error Handling
**Problem:** Some endpoints check for empty gateways, others don't
**Example:** DonateController.charge() checks, but others may not

### 4. No Capability Detection
**Problem:** No runtime way to determine what features each provider supports
**Impact:** UI can't adapt, leading to runtime errors

## Single-Gateway Loading Pattern

### Current Pattern (Problematic)
```typescript
// Repeated in 13+ locations across giving controllers
const gateways = (await this.repos.gateway.loadAll(churchId)) as any[];
const gateway = gateways[0];  // No validation, assumes exists
```

**Problems:**
- Duplicated code across all controllers
- No null/empty array checking
- Brittle array indexing
- Inconsistent error handling
- No provider-specific validation

### Recommended Pattern for Consistent Adoption

**Step 1: Add centralized method to GatewayService**
```typescript
// Add to GatewayService class
static async getGatewayForChurch(churchId: string, repos: any): Promise<Gateway | null> {
  const gateways = await repos.gateway.loadAll(churchId);
  return gateways.length > 0 ? gateways[0] : null;
}

static async requireGatewayForChurch(churchId: string, repos: any): Promise<Gateway> {
  const gateway = await this.getGatewayForChurch(churchId, repos);
  if (!gateway) {
    throw new Error("No payment gateway configured for this church");
  }
  return gateway;
}
```

**Step 2: Standardize usage in controllers**
```typescript
// Replace all instances of the old pattern with:
try {
  const gateway = await GatewayService.requireGatewayForChurch(churchId, this.repos);
  // Use gateway...
} catch (error) {
  return this.json({ error: error.message }, 400);
}

// Or for optional gateway:
const gateway = await GatewayService.getGatewayForChurch(churchId, this.repos);
if (!gateway) {
  return this.json({ error: "No payment gateway configured" }, 400);
}
```

**Step 3: Add provider capability checking (Phase 1)**
```typescript
// Future enhancement
static getProviderCapabilities(gateway: Gateway): ProviderCapabilities {
  // Return what features this provider supports
}
```

### Migration Plan

**Files to Update (13+ locations):**
1. `DonateController.ts` - Lines 29, 61, 112, 168, 201
2. `PaymentMethodController.ts` - Lines 25, 42, 97, 124, 163, 182, 201
3. `CustomerController.ts` - Line 41
4. `SubscriptionController.ts` - Multiple locations
5. `GatewayController.ts` - Gateway management endpoints

**Benefits:**
1. **Centralized logic** - Single point of truth for gateway loading
2. **Consistent error handling** - Standardized error messages
3. **Null safety** - Explicit validation before usage
4. **Future-proof** - Easier to extend for multi-gateway support
5. **Testable** - Centralized method can be unit tested
6. **Maintainable** - Changes to loading logic only require one update

## Next Steps (Phase 1)

1. **Implement centralized gateway loading** in GatewayService
2. **Add capability detection** per provider
3. **Replace all `gateways[0]` patterns** with centralized helper
4. **Add provider-specific validation** before calling methods
5. **Standardize error handling** across all controllers