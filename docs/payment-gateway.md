# Skunkworks Academy Checkout

The payment gateway implementation lives inside `skunkworks-academy/portal` so checkout, learner identity, payment records, and entitlements remain in one operational system.

## Architecture

```text
portal checkout page
  -> portal API checkout session
  -> hosted PayFast or PayPal gateway
  -> verified gateway notification
  -> PaymentTransactions list
  -> Entitlements list
  -> learner access
```

The browser does not receive gateway secrets. Plan prices are defined and validated by the Azure Functions API.

## Public pages

| Page | Purpose |
|---|---|
| `/checkout/` | Hosted checkout page. |
| `/checkout/success/` | Gateway return page. |
| `/checkout/cancel/` | Cancelled checkout page. |

## API routes

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/checkout/plans` | Returns approved plan data. |
| `POST` | `/api/checkout/sessions` | Creates a gateway checkout session. |
| `POST` | `/api/checkout/paypal/capture` | Finalises a PayPal order after buyer approval. |
| `POST` | `/api/webhooks/payfast/itn` | Handles PayFast notification processing. |
| `POST` | `/api/webhooks/paypal` | Handles PayPal notification processing. |

## Plans

| Plan ID | Entitlement | ZAR | USD |
|---|---|---:|---:|
| `starter-monthly` | `academy.starter` | 149 | 9 |
| `pro-monthly` | `academy.pro` | 399 | 22 |
| `mentor-monthly` | `academy.mentor` | 999 | 55 |
| `team-seat-monthly` | `academy.team_seat` | 450 | 25 |

## Required settings

```text
PUBLIC_API_BASE_URL
PAYFAST_ENV
PAYFAST_MERCHANT_ID
PAYFAST_MERCHANT_KEY
PAYFAST_PASSPHRASE
PAYFAST_SKIP_SERVER_VALIDATION
PAYPAL_ENV
PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET
PAYPAL_WEBHOOK_ID
```

Existing portal Graph and SharePoint settings remain required.

## Provisioning

Run:

```bash
npm run provision:sharepoint
npm run provision:payments
```

The payment provisioning script creates:

- `PaymentTransactions`
- `Entitlements`

## Security controls

- PayFast and PayPal host payment collection.
- Browser plan IDs are untrusted input.
- The API validates plan, amount, currency, and gateway.
- Gateway notification verification is required before access is issued.
- Entitlements are created only after verified gateway processing.
- Duplicate entitlement writes are blocked by payment transaction ID.

## Production checklist

1. Configure sandbox gateway credentials.
2. Configure Azure Function app settings.
3. Run payment provisioning.
4. Register gateway notification URLs in the PayFast and PayPal dashboards.
5. Test every plan in sandbox.
6. Confirm payment records update to `Complete`.
7. Confirm entitlements are created correctly.
8. Switch to live gateway settings.
9. Run one live low-value test before public launch.

## Note

The PayPal implementation uses an order approval and capture flow. For recurring PayPal subscriptions, add PayPal Billing Plan IDs and extend `api/payments.ts` to use PayPal subscription creation.
