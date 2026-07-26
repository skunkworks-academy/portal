# Skunkworks Academy Checkout

The payment gateway implementation lives inside `skunkworks-academy/portal` so checkout, learner identity, payment records, subscription lifecycle, and entitlements remain in one operational system.

## Architecture

```text
plans-and-purchases page
  -> portal checkout page
  -> portal API validates the Academy plan and buyer
  -> PayFast recurring checkout OR PayPal JavaScript SDK subscription
  -> verified PayFast ITN OR signed PayPal webhook
  -> PaymentTransactions list
  -> Entitlements list
  -> learner access
```

The browser never receives PayPal client secrets or PayFast credentials. The PayPal client ID and billing plan IDs are public integration identifiers; all prices, internal plan mappings, transaction references, and entitlement changes are validated by the Azure Functions API.

## Public pages

| Page | Purpose |
|---|---|
| `/checkout/` | Hosted recurring-plan checkout page. |
| `/checkout/success/` | Gateway return and pending-verification page. |
| `/checkout/cancel/` | Cancelled checkout page. |

## API routes

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/checkout/plans` | Returns approved Academy plan data and configured PayPal billing plan IDs. |
| `GET` | `/api/checkout/paypal/config` | Returns the public PayPal JavaScript SDK configuration. |
| `POST` | `/api/checkout/sessions` | Creates PayFast checkout or a backwards-compatible PayPal subscription intent. |
| `POST` | `/api/checkout/paypal/subscription-intents` | Creates the internal transaction before PayPal subscription approval. |
| `POST` | `/api/checkout/paypal/subscriptions/approve` | Verifies the approved PayPal subscription against PayPal and binds it to the internal transaction. |
| `POST` | `/api/checkout/paypal/capture` | Legacy endpoint retained for previously-created one-time PayPal orders. |
| `POST` | `/api/webhooks/payfast/itn` | Handles verified PayFast notification processing. |
| `POST` | `/api/webhooks/paypal` | Verifies and processes PayPal subscription and recurring-payment webhooks. |

## Subscription plans

| Academy plan | Entitlement | PayFast ZAR/month | PayPal USD/month | PayPal setting |
|---|---|---:|---:|---|
| `starter-monthly` | `academy.starter` | 149 | 9 | `PAYPAL_PLAN_STARTER_MONTHLY` |
| `pro-monthly` | `academy.pro` | 399 | 22 | `PAYPAL_PLAN_PRO_MONTHLY` |
| `mentor-monthly` | `academy.mentor` | 999 | 55 | `PAYPAL_PLAN_MENTOR_MONTHLY` |
| `team-seat-monthly` | `academy.team_seat` | 450 | 25 | `PAYPAL_PLAN_TEAM_SEAT_MONTHLY` |

A PayPal billing plan is currency-specific. Create separate plans for any future non-USD PayPal pricing.

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
PAYPAL_PRODUCT_ID
PAYPAL_PLAN_STARTER_MONTHLY
PAYPAL_PLAN_PRO_MONTHLY
PAYPAL_PLAN_MENTOR_MONTHLY
PAYPAL_PLAN_TEAM_SEAT_MONTHLY
PAYPAL_WEBHOOK_ID
```

Existing portal Microsoft Graph and SharePoint settings remain required.

## Provisioning

First provision the SharePoint lists:

```bash
npm run provision:sharepoint
npm run provision:payments
```

Then provide `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`, and `PUBLIC_API_BASE_URL`, and run:

```bash
npm run provision:paypal
```

The PayPal provisioning script:

1. Creates or reuses the Academy subscription product.
2. Creates or reuses four monthly USD billing plans.
3. Creates or reuses the webhook at `${PUBLIC_API_BASE_URL}/webhooks/paypal`.
4. Prints the PayPal product, plan, and webhook application settings required by Azure Functions.

Do not commit `PAYPAL_CLIENT_SECRET`, PayFast credentials, or production app settings.

## PayPal browser flow

1. The checkout page loads the public PayPal client ID and configured billing plan IDs from the API.
2. The browser loads the PayPal JavaScript SDK with `vault=true` and `intent=subscription`.
3. Before the PayPal popup opens, the browser creates an internal subscription intent.
4. `actions.subscription.create()` creates the PayPal subscription using the server-approved plan ID and internal transaction ID.
5. After buyer approval, the browser sends the subscription ID to the API.
6. The API retrieves the subscription from PayPal and validates the billing plan and internal transaction reference.
7. Access remains pending until a signed PayPal webhook confirms activation or payment.

## PayPal webhook lifecycle

Register these webhook events:

- `BILLING.SUBSCRIPTION.CREATED`
- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.UPDATED`
- `BILLING.SUBSCRIPTION.SUSPENDED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.EXPIRED`
- `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
- `PAYMENT.SALE.COMPLETED`
- `PAYMENT.SALE.REFUNDED`
- `PAYMENT.SALE.REVERSED`

Processing rules:

- Activation and completed recurring sales activate or renew the entitlement.
- Cancellation, expiration, suspension, refund, and reversal update the entitlement lifecycle.
- A single failed payment marks the payment transaction failed but does not immediately revoke a still-valid entitlement.
- PayPal plan settings enable automatic outstanding-balance billing and suspend after three consecutive payment failures.

## Security controls

- Hosted gateways collect payment details.
- Browser plan IDs and buyer details are untrusted input.
- The API validates Academy plan, amount, currency, PayPal billing plan, and internal transaction reference.
- PayPal webhook signatures are verified through PayPal before any lifecycle update.
- Entitlements are never granted from a browser redirect.
- Repeated webhook delivery is safe because entitlement validity is reset to the current verified billing window rather than incremented blindly.
- Duplicate entitlement records are blocked by the payment transaction ID.

## Production checklist

1. Configure PayPal sandbox business and buyer accounts.
2. Configure sandbox PayPal and PayFast credentials in the Azure Function App.
3. Run SharePoint payment provisioning.
4. Run PayPal product, billing-plan, and webhook provisioning.
5. Deploy the API and portal checkout assets.
6. Test every plan in PayPal sandbox and PayFast sandbox.
7. Confirm `PaymentTransactions` stores the PayPal subscription ID.
8. Confirm signed activation/payment webhooks create or renew entitlements.
9. Confirm cancellation and suspension events update entitlement status.
10. Switch to live PayPal resources and `PAYPAL_ENV=live`.
11. Run one live low-value subscription and cancellation test before public launch.
