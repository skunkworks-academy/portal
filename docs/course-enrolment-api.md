# Course enrolment and subscription records

The Portal API stores learner course enrolments in the SharePoint list `CourseEnrollments`. Payment lifecycle records remain in `PaymentTransactions`, and verified subscription entitlements remain in `Entitlements`.

## Learner journey

1. A learner opens a protected course and selects **Register or enrol**.
2. The course sends the learner to:

   ```text
   https://portal.skunkworksacademy.com/checkout/?courseId=<COURSE_ID>&returnUrl=<COURSE_URL>
   ```

3. The checkout page records a `CourseEnrollments` row before starting PayFast or PayPal.
4. The learner either:
   - chooses a recurring plan and completes hosted payment; or
   - selects **Submit enrolment request** for manual review.
5. Verified PayFast ITN or PayPal webhook events create or renew an `Entitlements` row.
6. `GET /api/course-access` binds the enrolment to the authenticated Entra learner and activates the course when a valid entitlement exists.
7. Course content remains locked for unauthenticated, unknown, suspended, cancelled, rejected or unpaid records.

## Stored records

### CourseEnrollments

| Field | Purpose |
|---|---|
| `CourseId` | Stable course code such as `GHP-DOM-101` |
| `CourseTitle` | Human-readable course title |
| `LearnerObjectId` | Microsoft Entra object ID after account binding |
| `LearnerTenantId` | Microsoft Entra tenant ID |
| `LearnerEmail` | Normalised learner email |
| `LearnerName` | Learner display name |
| `Status` | Submitted, PendingPayment, Active, Waitlisted, Suspended, Cancelled, Completed or Rejected |
| `Source` | checkout, portal, admin or migration |
| `PlanId` | Academy subscription plan selected at checkout |
| `Gateway` | payfast, paypal, manual or none |
| `PaymentTransactionId` | Related payment transaction |
| `EntitlementId` | Related verified entitlement |
| `ProviderReference` | Gateway reference |
| `ReturnUrl` | Course route to return to after enrolment |
| `SubmittedAt`, `ActivatedAt`, `UpdatedAt` | Lifecycle timestamps |
| `Notes` | Administrative review notes |

## API operations

All authenticated calls use:

```http
Authorization: Bearer <Portal API access token>
Accept: application/json
```

### Submit a checkout enrolment request

```http
POST /api/enrolments/requests
Content-Type: application/json
Origin: https://portal.skunkworksacademy.com
```

```json
{
  "courseId": "GHP-DOM-101",
  "learnerName": "A Learner",
  "learnerEmail": "learner@example.com",
  "planId": "starter-monthly",
  "gateway": "payfast",
  "returnUrl": "https://skunkworks-academy.github.io/course-catalog/courses/github-pages-setup"
}
```

This endpoint creates or updates a pending enrolment. It does not grant course access.

### Submit an authenticated enrolment request

```http
POST /api/enrolments
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "courseId": "M365-LIC-101",
  "learnerName": "A Learner",
  "gateway": "manual"
}
```

The API takes the learner object ID, tenant and email from the validated token rather than trusting browser-supplied identity claims.

### Query the current learner's enrolments

```http
GET /api/me/enrolments
Authorization: Bearer <token>
```

### Check course access

```http
GET /api/course-access?courseId=GHP-DOM-101
Authorization: Bearer <token>
Origin: https://skunkworks-academy.github.io
```

Allowed response:

```json
{
  "allowed": true,
  "courseId": "GHP-DOM-101",
  "learnerId": "<entra-object-id>",
  "enrolmentId": "42",
  "enrolmentStatus": "active"
}
```

Responses are `Cache-Control: no-store, private`. A missing account returns `401`; no valid enrolment or entitlement returns `403`; an unknown course returns `404`.

### Query enrolments as Portal Staff or Admin

```http
GET /api/admin/enrolments?courseId=GHP-DOM-101&status=Active&email=learner@example.com
Authorization: Bearer <admin-token>
```

Each query parameter is optional.

### Approve, suspend or complete an enrolment

```http
PATCH /api/admin/enrolments/42
Authorization: Bearer <admin-token>
Content-Type: application/json
```

```json
{
  "status": "Active",
  "notes": "Manual approval confirmed by training operations."
}
```

### Query subscription and entitlement records

```http
GET /api/admin/subscriptions?email=learner@example.com&status=Active
Authorization: Bearer <admin-token>
```

The response contains separate `transactions` and `entitlements` arrays sourced from SharePoint.

## Provisioning

Provision or confirm all three lists:

```bash
npm run provision:payments
```

Required environment variables:

```text
GRAPH_TENANT_ID
API_CLIENT_ID
API_CLIENT_SECRET
SHAREPOINT_HOSTNAME
SHAREPOINT_SITE_PATH
```

The Azure Function deployment guarantees CORS access for both `https://portal.skunkworksacademy.com` and `https://skunkworks-academy.github.io` even when an older GitHub Actions variable omits the catalogue origin.

## Security controls

- Anonymous checkout submissions can only originate from configured browser origins.
- A honeypot field rejects automated form submissions that populate it.
- Anonymous enrolment submission never grants access.
- Learner identity is bound from verified Entra token claims.
- Admin queries require `Portal.Admin` or `Portal.Staff`.
- Gateway browser redirects do not activate entitlements.
- Only verified PayFast ITN and PayPal webhook events create payment entitlements.
- Course access decisions are fail-closed and are not cached.
