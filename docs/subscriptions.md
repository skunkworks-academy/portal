---
title: "Subscriptions"
slug: /docs/subscriptions/
createTime: "2024-07-08T05:25:46.497Z"
updateTime: "2026-07-22T00:00:00.000Z"
---

# Subscriptions

Skunkworks Academy uses recurring subscriptions to bill learners and teams at regular intervals. The integration supports:

- Fixed monthly billing for Starter, Pro, Mentor, and Team Seat plans.
- PayFast recurring payments in ZAR.
- PayPal subscriptions in USD.
- Automated outstanding-balance recovery through PayPal billing-plan preferences.
- Entitlement renewal after verified recurring-payment events.
- Suspension, cancellation, expiration, refund, and reversal lifecycle handling.

## How it works

1. A PayPal catalog product represents Skunkworks Academy subscription services.
2. A PayPal billing plan represents each monthly Academy plan and its USD price.
3. The checkout page loads the PayPal JavaScript SDK with `vault=true` and `intent=subscription`.
4. The buyer enters the Academy entitlement email address.
5. The portal API creates an internal payment transaction and returns the approved PayPal billing plan ID.
6. The PayPal button creates the subscription.
7. The buyer approves the recurring agreement in PayPal.
8. The portal API verifies the subscription against PayPal and binds it to the internal transaction.
9. Signed PayPal webhooks activate, renew, suspend, cancel, or expire the entitlement.

## PayPal subscription routes

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/checkout/paypal/config` | Returns the public SDK client ID and subscription settings. |
| `POST` | `/api/checkout/paypal/subscription-intents` | Creates the Academy transaction before PayPal approval. |
| `POST` | `/api/checkout/paypal/subscriptions/approve` | Verifies and binds an approved PayPal subscription. |
| `POST` | `/api/webhooks/paypal` | Processes signed subscription and recurring-payment events. |

## Provision PayPal resources

Configure sandbox credentials and run:

```bash
npm run provision:paypal
```

The command creates or reuses:

- The Academy PayPal catalog product.
- Four monthly USD billing plans.
- The PayPal webhook pointing to the portal API.

It prints the PayPal product, plan, and webhook IDs that must be configured in the Azure Function App.

## Required PayPal settings

```text
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

`PAYPAL_CLIENT_SECRET` is server-only. The browser receives only the public client ID and configured billing plan IDs.

## Webhook events

The portal processes these events:

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

## Security model

- Payment details remain on PayPal or PayFast.
- Prices and billing-plan mappings are controlled by the portal API.
- Browser redirects and client callbacks cannot grant entitlements.
- PayPal webhook signatures are verified through PayPal.
- Recurring payment events update SharePoint-backed payment and entitlement records.
- Duplicate webhook delivery does not create duplicate entitlements.

## References

- [PayPal Subscriptions overview](https://developer.paypal.com/docs/subscriptions/)
- [PayPal Subscriptions integration guide](https://developer.paypal.com/docs/subscriptions/integrate/)
- [PayPal Subscriptions REST API](https://developer.paypal.com/docs/api/subscriptions/v1/)
- [PayPal subscription webhooks](https://developer.paypal.com/docs/subscriptions/reference/webhooks/)
