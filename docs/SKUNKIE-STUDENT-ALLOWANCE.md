# Skunkie monthly student allowance

The account owner approved Azure GlobalStandard processing and a maximum US$1 of model usage per Student account per calendar month. Calendar boundaries use Africa/Johannesburg (UTC+02:00). This is a model-usage allowance, not an Azure invoice cap: existing hosting, database operations, taxes and currency conversion are outside it.

## Identity and enforcement

Only verified Portal API users with Student eligibility may generate replies. The established default Student policy remains; a management account needs its explicit Portal.Student role. Multiple roles share one allowance. The server hashes the verified tenant and subject into the ledger key. Browser workspace choice, email address, posted identity and posted prices cannot grant or reset an allowance.

The existing organization-partitioned Cosmos container stores a separate budget document per account and month. The document contains counters, token counts and server-generated request IDs, never chat content or email addresses. TTL is disabled for these records. Atomic create and ETag-conditional replacement serialize holds across Function instances. Ambiguous writes never authorize model dispatch. Single-write-region topology is checked at runtime; storage failure prevents paid requests.

Before each single provider attempt, the server holds US$0.4208704. This covers 1,048,576 input tokens (rounded upward from the documented 1,047,576-token model context) plus the enforced 900-token output maximum. This intentionally uses the entire model context rather than a character-count estimate. At most two such requests can start together from a fresh allowance.

On a valid response from the pinned model, prompt tokens cost 400 nanodollars each and output tokens cost 1,600 nanodollars each (US$0.40 and US$1.60 per million). Cached input is conservatively charged at the full input rate. Verified usage replaces the hold exactly once. Azure explicitly documents authentication 401 and rate-limit 429 as unprocessed and uncharged, so these settle to zero. Missing, inconsistent or invalid usage, timeouts, other provider failures and process crashes retain the hold. In particular, content-filter 400 and timeout 408 responses can be billable. Settlement alone may retry twice with the same reservation and verified usage; an unresolved settlement retains its hold. No automatic provider retry or redirect is allowed.

A new reply is refused if its maximum hold cannot fit. Therefore some allowance may remain unused. The browser displays the remaining amount after completed usage and outstanding holds, alongside the South African reset date. A monthly 4,096-request storage bound also prevents further requests without fabricating a usage charge. An unexpected model-usage overrun pauses the account for investigation.

## Activation and maintenance

Deploy this limiter before adding provider credentials. The workflow must confirm the running health response identifies policy student-usd1-gpt41mini-2025-04-14-v1, validate the exact GlobalStandard gpt-4.1-mini model version 2025-04-14 with NoAutoUpgrade, and validate the single-writer Cosmos configuration before restoring provider settings. A provider key without the matching budget policy and storage configuration cannot activate chat.

The only supported provider is the checked Azure OpenAI deployment. A model/version/SKU/price change requires a reviewed policy update before enabling generation. Never increase the allowance, change the ledger namespace, delete current ledgers, or release ambiguous holds as a deployment workaround. Reconcile unresolved usage from trusted provider billing evidence before any manual adjustment. The server identity needs readMetadata plus document access in the configured container; do not grant account-wide data access merely to satisfy account metadata discovery.

Validation includes concurrent reservation races, duplicate IDs and settlements, ambiguous storage writes, malformed provider usage, cross-account protection, Johannesburg month rollover, topology drift, provider failures and browser draft/allowance isolation. Mocked tests do not establish live provider access: after activation, a legitimate signed-in Student must confirm a generated response and a corresponding settled ledger amount.

## Sources checked 6 November 2026

- [Azure model context and version](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure#gpt-41-series)
- [Azure OpenAI pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service/): South Africa North GlobalStandard non-batch rates were cross-checked with Azure Retail Prices API records.
- [Azure OpenAI billing and errors](https://learn.microsoft.com/en-us/azure/foundry-classic/openai/faq#we-noticed-charges-associated-with-api-calls-that-failed-to-complete-with-status-code-400-why-are-failed-api-calls-generating-a-charge): unsuccessful responses can still incur usage; 401 and 429 are documented unprocessed exceptions.
- [Cosmos optimistic concurrency](https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/database-transactions-optimistic-concurrency)
- [Cosmos account metadata](https://learn.microsoft.com/en-us/rest/api/cosmos-db/get-database-account)
