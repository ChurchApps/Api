# Kingdom Funding Gateway — Accept Blue → NMI Migration (Handoff)

**Prepared by RevitPay for the B1 Church App dev team.**

## 1. What this is

The Kingdom Funding payment gateway has been migrated from **Accept Blue** to **NMI** (Network Merchants Inc.).

**Why:** Accept Blue cannot tokenize ACH/eCheck. NMI's **Collect.js** tokenizes *both* cards and ACH into a single-use `payment_token`, so donors can now give by bank account as well as card.

**Scope is intentionally narrow:** the "Kingdom Funding" name, branding, signup flow, locale strings, dropdown labels, and the admin gateway-settings page are **unchanged**. Only the gateway's internal calls changed.

## 2. Where the code is

Work was done in private mirrors under the **RevitPay** GitHub org, on branch **`nmi-gateway`** (base `main`). Open PRs to review and merge:

| Repo | PR | Notes |
|------|----|-------|
| RevitPay/B1Api | https://github.com/RevitPay/B1Api/pull/1 | Backend gateway provider + controllers |
| RevitPay/Packages | https://github.com/RevitPay/Packages/pull/1 | apphelper donation components (Collect.js) |
| RevitPay/B1Admin | https://github.com/RevitPay/B1Admin/pull/1 | One comment fix (gateway settings) |
| B1App | — | No changes (consumes apphelper) |

> To review/merge, your team needs collaborator access to these RevitPay repos (or we can transfer them / re-target the PRs to a repo you own — your call). RevitPay does **not** merge these; your team does.

## 3. What changed

### Backend — `B1Api`
- **`src/shared/helpers/gateways/KingdomFundingGatewayProvider.ts`** — fully reimplemented against the **NMI Payment API** (`POST https://secure.nmi.com/api/transact.php`, form-urlencoded, url-encoded responses, `response=1` = approved):
  - One-time **card + ACH** charge via Collect.js `payment_token` (raw routing/account ACH path also supported).
  - **Customer Vault** (`add_customer`/`add_billing`/`delete_*`) for saved payment methods (`customer_vault_id`).
  - **Recurring** via `add_subscription` / `update_subscription` / `delete_subscription` (vault the method, charge-today-if-applicable, then schedule).
  - **Refund/void** (`type=refund` / `type=void`).
  - **Webhook** verification: `Webhook-Signature: t=<nonce>,s=<hmac>`, HMAC-SHA256 over `<nonce>.<rawBody>`, timing-safe compare.
- **`DonateController.ts`** — updated the KF charge + webhook glue that still assumed Accept Blue conventions (removed `nonce-`/`pm-` token prefixes; recognize NMI vault UUIDs; NMI webhook event names `transaction.sale.success` / `check.*`; label ACH donations as method "ACH").
- **`CustomerController.ts` / `PaymentMethodController.ts`** — recurring-schedule normalization and payment-method delete updated to NMI's shape (status string vs `active` flag, vault UUIDs, `customer_vault_id`).
- **Tests:** `src/shared/helpers/gateways/__tests__/KingdomFundingGatewayProvider.test.ts` covers webhook signature verification (string + raw-buffer body, tamper/missing-key rejection).
- **`tools/seed-nmi-gateway.ts`** — local-dev helper that adds a Kingdom Funding/NMI gateway row to a church (see §5).

### Frontend — `Packages/apphelper`
- **`KingdomFundingTokenForm.tsx`** — replaced the Accept Blue hosted iframe with **NMI Collect.js**; supports `paymentMethod` `"card"` or `"ach"`; returns the NMI `payment_token` (result is backward-compatible with existing card callers).
- **`MultiGatewayDonationForm.tsx`, `KingdomFundingNonAuthDonationInner.tsx`, `PaymentMethods.tsx`** — added a Card / Bank (ACH) toggle and route `type:"bank"` with the token; removed the old un-tokenized routing/account inputs and the `KF_ACH_ENABLED=false` gates.
- Locale strings `payWithCard` / `payWithBank` added.

## 4. Configuration (per church)

Credentials live in the existing `gateways` table (encrypted at rest) and are entered on the B1Admin gateway-settings page — **column meaning is unchanged**, only the values are NMI's:

| Column | Value |
|--------|-------|
| `publicKey` | NMI **Collect.js tokenization key** (public; used in the browser) |
| `privateKey` | NMI **Security Key** (server-side secret) |
| `webhookKey` | NMI **webhook signing key** |
| `provider` | `kingdomfunding` |

### Webhook
- **NMI does not generate a signing key for you** — you create your own secret, enter it on the NMI webhook endpoint, and store the same value as `webhookKey`.
- Endpoint URL to register in NMI (Settings → Webhooks):
  `https://<api-host>/giving/donate/webhook/kingdomfunding?churchId=<CHURCH_ID>`
- Subscribe to: `transaction.sale.success`, `transaction.auth.success`, refund events, and the ACH **check status** events.

## 5. How to run/test locally

Requires Node + MySQL 8 (Docker is easiest).

```bash
# 1. MySQL
docker run -d --name b1-mysql -e MYSQL_ROOT_PASSWORD=b1local -p 3306:3306 mysql:8
docker exec b1-mysql mysql -uroot -pb1local -e \
  "CREATE DATABASE membership; CREATE DATABASE attendance; CREATE DATABASE content; \
   CREATE DATABASE giving; CREATE DATABASE messaging; CREATE DATABASE doing; CREATE DATABASE reporting;"

# 2. B1Api/.env (gitignored) — set connection strings + secrets, e.g.
#   ENVIRONMENT=dev  SERVER_PORT=8084
#   ENCRYPTION_KEY=<32 chars>  JWT_SECRET=<any>
#   <MODULE>_CONNECTION_STRING=mysql://root:b1local@localhost:3306/<module>   (per module)
#   NMI_SECURITY_KEY=...  NMI_TOKENIZATION_KEY=...  NMI_WEBHOOK_KEY=...  NMI_API_URL=https://secure.nmi.com/api/transact.php

cd B1Api
npm install
npm run migrate:up        # schema for all modules
npm run populateDemo      # seeds Grace Community Church (CHU00000001)
npx tsx tools/seed-nmi-gateway.ts   # adds a kingdomfunding gateway to Grace with the .env NMI keys
npm run dev               # http://localhost:8084
```

Then drive a donation through Collect.js (card or ACH); the charge flows to the NMI sandbox and a donation row is written to `giving.donations`. NMI sandbox test card: `4111111111111111`, any future expiry, CVV `999`. ACH test: routing `123123123`, account `123456789`.

## 6. Verification already done

- `tsc` clean on B1Api and apphelper; 17/17 gateway unit tests pass.
- Live NMI sandbox: card, debit, ACH, Customer Vault, recurring, void, refund all approved.
- Full end-to-end in a real browser (Collect.js → B1Api → NMI sandbox → donation + fund allocation logged) for **card and ACH**.

## 7. Recommended before go-live

1. **Live webhook delivery test** — point an NMI webhook at a publicly reachable instance (or a tunnel) and confirm ACH settlement/return events post donations. The signature verification is unit-tested; only the live round-trip remains.
2. **Confirm NMI Query API field names** — the "view recurring donations" and "saved payment methods" screens read NMI `query.php` (XML). The field mapping is best-effort and marked in code; verify against a live subscription/vault list once there's recurring data in your NMI account.
