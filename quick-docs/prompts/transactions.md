# Cielo transactions

The high-level goal is to receive Cielo's transaction notifications, keep an
immutable record of every notification, look up each notified transaction in
Cielo's query API, and store its current state so users can see their sales.
Read `quick-docs/cielo/onboarding-status.md` for the existing onboarding
notification flow before implementing it; the transaction flow mirrors its
authentication but is otherwise separate.

- Cielo-specific backend code lives in the `cielo` Django app.
- All Cielo models and URLs are prefixed with `cielo`.

References:

- Transaction notification: https://docs.cielo.com.br/split/reference/post-notificacao
- Transaction lookup: https://docs.cielo.com.br/split/reference/consultar-transa%C3%A7%C3%B5es
- Transaction status list: https://docs.cielo.com.br/split/reference/lista-de-status-da-transa%C3%A7%C3%A3o

## Goals

- Listen to transaction notifications from Cielo on a dedicated endpoint.
- Keep an immutable record of every transaction notification received.
- For payment status changes, look up the transaction and create or update one
  `CieloTransaction` per `PaymentId`.
- Replace the `/sales` page with a paginated table of the selected business's
  transactions.
- Let developers generate transactions and notifications with the mock Cielo
  API.

## Out of scope

- Registering the notification URL or its headers with Cielo.
- Retrying failed lookups or periodically re-checking transactions. The
  `last_lookup_at` and `lookup_error` fields exist so this can be added later.
- Looking up transactions for any `ChangeType` other than `1` and `25`.
- The `Payment.SplitPayments` node: no split model, no per-seller amounts, and
  no use of `SubordinateMerchantId`.
- Showing transactions of child businesses: a reseller sees only its own.
- Recurrence (`RecurrentPaymentId`) handling.

## Rename the onboarding notification

`CieloNotification` only represents onboarding notifications. Rename it before
adding the transaction models:

| Current                                                                                                             | New                                                                |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `CieloNotification`                                                                                                 | `CieloOnboardingNotification`                                      |
| `CieloNotificationQuerySet`                                                                                         | `CieloOnboardingNotificationQuerySet`                              |
| `CieloNotificationImmutableError`                                                                                   | `CieloOnboardingNotificationImmutableError`                        |
| table `cielo_notifications`                                                                                         | table `cielo_onboarding_notifications`                             |
| reverse name `notifications`                                                                                        | reverse name `onboarding_notifications`                            |
| `CieloNotificationView`                                                                                             | `CieloOnboardingNotificationView`                                  |
| URL name `cielo_notifications`                                                                                      | URL name `cielo_onboarding_notifications`                          |
| `services/notifications.py`                                                                                         | `services/onboarding_notifications.py`                             |
| `CieloNotificationPayloadError`, `ParsedCieloNotification`, `parse_cielo_notification`, `record_cielo_notification` | `CieloOnboarding…` / `…_cielo_onboarding_notification` equivalents |
| `CieloNotificationAdmin`                                                                                            | `CieloOnboardingNotificationAdmin`                                 |

- Move the endpoint from `POST /cielo/notifications/` to
  `POST /cielo/onboarding/notifications/`, matching the new transaction
  endpoint. Nothing is configured with Cielo yet. Update the URL in
  `local-mock-cielo/.env.example` and the mock README; the developer updates
  their local mock `.env`.
- `CieloNotificationStatusField` serializes any Cielo integer status, not a
  notification. Rename it to `CieloStatusField` and reuse it for transactions.
- Update the onboarding tests, `quick-docs/cielo/onboarding-status.md`, and any
  other reference to the old names or path.
- Generate the migration non-interactively with
  `docker compose exec -T web python manage.py makemigrations cielo`. Without
  a TTY Django does not ask whether the model was renamed, so the migration
  deletes the old table and creates the new one. Existing onboarding
  notification rows are dropped; this is accepted because there is no
  production data. Never hand-write or edit the migration.

## Choices

Use Django choices with pt-BR labels. Cielo may send a value that is not
listed: store it unchanged, never enforce the choices on save, and label an
unlisted value `Desconhecido (<value>)` in the API.

`CieloTransactionChangeType` (`IntegerChoices`):

| Member                 | Value | Label                            |
| ---------------------- | ----- | -------------------------------- |
| `PAYMENT_STATUS`       | 1     | Mudança de status do pagamento   |
| `RECURRENCE_CREATED`   | 2     | Recorrência criada               |
| `ANTIFRAUD_STATUS`     | 3     | Mudança de status do antifraude  |
| `RECURRENCE_STATUS`    | 4     | Mudança de status da recorrência |
| `CANCELLATION_DENIED`  | 5     | Cancelamento negado              |
| `BOLETO_UNDERPAID`     | 6     | Boleto pago a menor              |
| `CHARGEBACK`           | 7     | Chargeback                       |
| `FRAUD_ALERT`          | 8     | Alerta de fraude                 |
| `PARTIAL_CANCELLATION` | 25    | Cancelamento parcial             |

`CieloTransactionStatus` (`IntegerChoices`), from Cielo's status list:

| Value | Cielo name         | Label          |
| ----- | ------------------ | -------------- |
| 0     | `NotFinished`      | Não finalizado |
| 1     | `Authorized`       | Autorizado     |
| 2     | `PaymentConfirmed` | Pago           |
| 3     | `Denied`           | Negado         |
| 10    | `Voided`           | Cancelado      |
| 11    | `Refunded`         | Estornado      |
| 12    | `Pending`          | Pendente       |
| 13    | `Aborted`          | Abortado       |
| 20    | `Scheduled`        | Agendado       |

`CieloTransactionPaymentType` (`TextChoices`), values exactly as Cielo sends
them:

| Value                | Label   |
| -------------------- | ------- |
| `CreditCard`         | Crédito |
| `DebitCard`          | Débito  |
| `SplittedCreditCard` | Crédito |
| `SplittedDebitCard`  | Débito  |
| `Pix`                | Pix     |
| `Boleto`             | Boleto  |

Split card transactions still carry their brand in `Payment.CreditCard` or
`Payment.DebitCard`.

### Card brand rename

Cielo's API sends Mastercard as `Master`. Change `CieloCardBrand.MASTERCARD`
(`"MasterCard"`) to `CieloCardBrand.MASTER` with value and label `Master`, so
plan rates and transactions use the same value:

- Generate the choices migration with `makemigrations`. Do not write a data
  migration: there is no production data, and existing development plan rates
  stored as `MasterCard` are recreated or fixed by hand.
- Update the frontend Cielo plans code and tests (`features/cielo-plans/`
  `types.ts`, `rates.ts`, `schemas.ts`, and `cielo-plan-form-page.test.tsx`)
  and `quick-docs/cielo/plans.md`.
- The OWN `Mastercard` choice is unrelated and stays unchanged.

`CieloTransactionLookupStatus` (`TextChoices`): `SUCCESS` (`Sucesso`) and
`FAILED` (`Falhou`).

## Data model

### `CieloTransactionNotification`

Immutable event model with table `cielo_transaction_notifications`. Enforce
immutability the same way as `CieloOnboardingNotification`: updating or
deleting a row raises an error, and the admin is read-only with no add,
change, or delete permission.

| Model field   | Requirement                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `transaction` | Nullable foreign key to `CieloTransaction` (`on_delete=PROTECT`), reverse name `notifications`. |
| `payment_id`  | Required, 36 characters, indexed. `PaymentId` as sent by Cielo.                                 |
| `change_type` | Required positive small integer, `CieloTransactionChangeType`, stored even when unlisted.       |
| `received_at` | Automatically set at creation.                                                                  |

`transaction` is set at creation and never changed afterwards: to the
transaction created or found for a change type that triggers a lookup, or to
an existing transaction with the same `payment_id` for any other change type,
otherwise `null`.

### `CieloTransaction`

One row per payment, table `cielo_transactions`. Every lookup field is
nullable because a transaction whose first lookup fails is stored with only
its `payment_id`.

| Model field      | Source                                                  | Requirement                                                                                                          |
| ---------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `payment_id`     | Notification `PaymentId`                                | Required, 36 characters, unique.                                                                                     |
| `merchant_id`    | `MerchantId`                                            | Nullable, 36 characters, indexed.                                                                                    |
| `cielo_business` | `CieloBusiness` by `merchant_id`                        | Nullable foreign key (`on_delete=PROTECT`), reverse name `transactions`. `null` when no seller matches.              |
| `installments`   | `Payment.Installments`                                  | Nullable positive small integer. `1` when a successful lookup omits it.                                              |
| `amount`         | `Payment.Amount`                                        | Nullable positive big integer, in cents.                                                                             |
| `received_date`  | `Payment.ReceivedDate`                                  | Nullable timezone-aware datetime. Cielo sends `YYYY-MM-DD HH:MM:SS` without a zone: parse it as `America/Sao_Paulo`. |
| `payment_type`   | `Payment.Type`                                          | Nullable, maximum 40 characters, `CieloTransactionPaymentType`, stored even when unlisted.                           |
| `brand`          | `Payment.CreditCard.Brand` or `Payment.DebitCard.Brand` | Nullable, maximum 30 characters. `null` when neither card node exists.                                               |
| `provider`       | `Payment.Provider`                                      | Nullable, maximum 30 characters.                                                                                     |
| `status`         | `Payment.Status`                                        | Nullable positive small integer, `CieloTransactionStatus`, stored even when unlisted.                                |
| `raw_response`   | Sanitized lookup response                               | Nullable JSON.                                                                                                       |
| `lookup_status`  | Lookup outcome                                          | `CieloTransactionLookupStatus`, nullable until the first lookup finishes.                                            |
| `last_lookup_at` | Lookup outcome                                          | Nullable timezone-aware datetime of the last lookup attempt, successful or not.                                      |
| `lookup_error`   | Lookup outcome                                          | Blank, maximum 255 characters. A short reason for the last failure; cleared on success.                              |
| `created_at`     | —                                                       | Automatically set at creation.                                                                                       |
| `updated_at`     | —                                                       | Automatically set on save.                                                                                           |

Sanitize the lookup response before storing it as `raw_response`:

- Remove the top-level `Customer` node.
- Remove `Payment.CreditCard` and `Payment.DebitCard`, and add their `Brand`
  as `Payment.Brand` when present.
- Keep everything else unchanged, including `Payment.SplitPayments`.

Register `CieloTransaction` in the admin as read-only, with a `lookup_status`
list filter so failed lookups can be found.

## Settings

Add `CIELO_QUERY_BASE_URL`, the base URL of Cielo's query API
(`https://apiquerysandbox.cieloecommerce.cielo.com.br` in sandbox,
`https://apiquery.cieloecommerce.cielo.com.br` in production). Treat it like
the other Cielo variables:

- Read it in `config/settings.py` with no application default.
- Add it to `get_cielo_configuration()` as `query_base_url`, validated like
  the other base URLs.
- Add it to `quick-portal-api/.env.example`, as a required variable in
  `quick-portal-api/docker-compose.yml`, and commented out alongside the other
  Cielo variables in `quick-portal-api/docker-compose.dev.yml`.
- The local development value `http://mock-cielo:3000` is never committed,
  like the existing mock wiring.

Transaction notifications reuse `CIELO_WEBHOOK_TOKEN`.

## Notification endpoint

Add `POST /cielo/transactions/notifications/` (URL name
`cielo_transaction_notifications`) with a new view, serializer or parser, and
service in `services/transaction_notifications.py`. Do not route transaction
notifications through the onboarding endpoint.

### Authentication

- Same as the onboarding endpoint: `authentication_classes = []`,
  `permission_classes = [AllowAny]`, token in `X-Cielo-Webhook-Token`,
  compared with `hmac.compare_digest`, never logged.
- A missing or blank `CIELO_WEBHOOK_TOKEN` is logged and returns `500` without
  processing.
- A missing or invalid token returns `401` and stores nothing.
- There is no `MasterMerchantId` in transaction notifications, so there is no
  merchant check.
- Extract the configuration and token check shared with the onboarding view
  into one helper instead of duplicating it.

### Payload

```json
{
  "PaymentId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "ChangeType": 1
}
```

A payload that is not an object, whose `PaymentId` is not a UUID string, or
whose `ChangeType` is not a non-negative integer returns `400`, is logged, and
stores nothing. Ignore any other key, including `RecurrentPaymentId`.

### Change types that trigger a lookup

Payment status changes (`1`) and partial cancellations or refunds (`25`)
trigger a lookup. Define them in one module-level constant in
`services/transaction_notifications.py`, for example
`LOOKUP_CHANGE_TYPES = frozenset({CieloTransactionChangeType.PAYMENT_STATUS,
CieloTransactionChangeType.PARTIAL_CANCELLATION})`, and branch only on
membership in it, so adding or removing a change type is a one-line change.

### Processing

1. Authenticate and validate the payload.
2. In one database transaction:
   - For a change type in `LOOKUP_CHANGE_TYPES`, get or create the
     `CieloTransaction` for `payment_id`. Concurrent notifications for the
     same payment must not create two rows: rely on the unique constraint and
     `get_or_create`.
   - For any other change type, find an existing transaction for
     `payment_id`, if any.
   - Create the `CieloTransactionNotification` linked to that transaction.
3. Commit, so the notification is kept whatever happens during the lookup.
4. For a change type in `LOOKUP_CHANGE_TYPES` only, look up the transaction
   (see below) while holding a `select_for_update` lock on its row, so two
   lookups for the same payment cannot overwrite each other out of order.
5. Return `200` with an empty JSON object once the notification is stored,
   even when the lookup fails. Cielo would otherwise resend the notification
   and the lookup would fail the same way.

Duplicate deliveries create duplicate notification rows and repeat the lookup,
which leaves the transaction in Cielo's current state. Out-of-order
notifications need no handling because the lookup always returns the current
state.

## Transaction lookup

Add `lookup_cielo_transaction(payment_id)` to `services/cielo_api.py`:

- `GET {CIELO_QUERY_BASE_URL}/1/sales/{PaymentId}` with
  `Authorization: Bearer <token>` from the existing `get_cielo_token()`.
- Use a 10-second timeout. The lookup runs inside Cielo's webhook request
  while holding the transaction's row lock, and `requests` waits forever
  without a timeout. If the query API hangs, the Django worker and the lock
  would be held indefinitely, Cielo's own delivery would time out and resend
  the notification, and each resend would block another worker on the same
  lock. The timeout turns a hanging lookup into a recorded failure.

Then, in the transaction service:

- **Success** (`200` with a valid body): set every lookup field from the
  response, set `cielo_business` to the `CieloBusiness` whose `merchant_id`
  equals `MerchantId` (or `null`, with a warning log, when none matches), set
  `lookup_status = SUCCESS`, `last_lookup_at = now`, and clear
  `lookup_error`.
- **Failure**: any configuration or credentials error, connection error,
  timeout, non-`200` response, invalid JSON, a `Payment.PaymentId` that
  differs from the notified one, or a missing or invalid `MerchantId`,
  `Payment.Amount`, `Payment.Status`, `Payment.Type`, or
  `Payment.ReceivedDate`. Keep every current lookup field, and set only
  `lookup_status = FAILED`, `last_lookup_at = now`, and a short
  `lookup_error`, for example `HTTP 404`, `Timeout`, or
  `Invalid response: Payment.Amount`. Never store response bodies, tokens, or headers in
  `lookup_error`. Log the failure; unexpected exceptions are logged with their
  traceback and recorded as failures instead of failing the request.

A transaction whose first lookup fails therefore exists with only
`payment_id`, `lookup_status = FAILED`, `last_lookup_at`, and `lookup_error`.

### Lookup response sample

```json
{
  "MerchantId": "f43fca07-48ec-46b5-8b93-ce79b75a8f63",
  "MerchantOrderId": "2014111701",
  "IsSplitted": true,
  "Customer": {
    "Name": "Comprador",
    "Address": {}
  },
  "Payment": {
    "ServiceTaxAmount": 0,
    "Installments": 1,
    "Capture": true,
    "Authenticate": false,
    "CreditCard": {
      "CardNumber": "455187******0181",
      "Holder": "Teste Holder",
      "ExpirationDate": "12/2021",
      "Brand": "Visa"
    },
    "ProofOfSale": "20171210061821319",
    "Tid": "1210061821319",
    "AuthorizationCode": "379918",
    "PaymentId": "507821c5-7067-49ff-928f-a3eb1e256148",
    "Type": "SplittedCreditCard",
    "Amount": 10000,
    "ReceivedDate": "2017-12-10 18:18:18",
    "CapturedAmount": 10000,
    "CapturedDate": "2017-12-10 18:18:21",
    "Currency": "BRL",
    "Country": "BRA",
    "Provider": "Simulado",
    "Status": 2,
    "Links": [
      {
        "Method": "GET",
        "Rel": "self",
        "Href": "https://apiquerysandbox.cieloecommerce.cielo.com.br/1/sales/507821c5-7067-49ff-928f-a3eb1e256148"
      },
      {
        "Method": "PUT",
        "Rel": "void",
        "Href": "https://apisandbox.cieloecommerce.cielo.com.br/1/sales/507821c5-7067-49ff-928f-a3eb1e256148/void"
      },
      {
        "Method": "PUT",
        "Rel": "sales.split",
        "Href": "https://splitsandbox.braspag.com.br/api/transactions507821c5-7067-49ff-928f-a3eb1e256148/split"
      }
    ],
    "SplitPayments": [
      {
        "SubordinateMerchantId": "f2d6eb34-2c6b-4948-8fff-51facdd2a28f",
        "Amount": 6000,
        "Fares": {
          "Mdr": 5,
          "Fee": 30
        },
        "Splits": [
          {
            "MerchantId": "f2d6eb34-2c6b-4948-8fff-51facdd2a28f",
            "Amount": 5670
          },
          {
            "MerchantId": "f43fca07-48ec-46b5-8b93-ce79b75a8f63",
            "Amount": 330
          }
        ]
      },
      {
        "SubordinateMerchantId": "9140ca78-3955-44a5-bd44-793370afef94",
        "Amount": 4000,
        "Fares": {
          "Mdr": 4,
          "Fee": 15
        },
        "Splits": [
          {
            "MerchantId": "9140ca78-3955-44a5-bd44-793370afef94",
            "Amount": 3825
          },
          {
            "MerchantId": "f43fca07-48ec-46b5-8b93-ce79b75a8f63",
            "Amount": 175
          }
        ]
      }
    ]
  }
}
```

`SplitPayments` is ignored in this feature but kept in `raw_response`.

## Transactions list endpoint

Add `GET /cielo/transactions/?business=<id>` (URL name `cielo_transactions`):

- Scope it with the existing `_scope_business`: any role on the selected
  business is enough, and an inaccessible business returns `404`.
- Return only transactions whose `cielo_business` belongs to the selected
  business. Never include child businesses.
- Only a successful lookup sets `cielo_business`, so transactions that were
  never looked up successfully are excluded by this filter. A transaction
  whose latest lookup failed after an earlier success stays visible with its
  previous values. Do not filter on `lookup_status`.
- A business without a Cielo seller returns an empty page.
- Order by `received_date` descending, then `id` descending.
- Paginate with the same settings as `BusinessPagination` (`page`,
  `page_size`, 20 per page, at most 100).

```json
{
  "count": 1,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 1,
      "payment_id": "507821c5-7067-49ff-928f-a3eb1e256148",
      "received_date": "2017-12-10T20:18:18Z",
      "amount": 10000,
      "installments": 1,
      "payment_type": { "value": "CreditCard", "label": "Crédito" },
      "brand": "Visa",
      "provider": "Simulado",
      "status": { "value": 2, "label": "Pago" }
    }
  ]
}
```

Use `CieloStatusField` for `status` and an equivalent field for the
`payment_type` text choices, both with the `Desconhecido (<value>)` fallback.
Do not expose `raw_response`, lookup fields, or notifications.

## Frontend

Replace the entire content of `/sales`:

- Remove the generated dashboard in `src/features/sales/` (`sales-data.ts`,
  the dashboard component, and its test) and render a transactions table in
  its place. Keep the `Sales` export used by the route.
- Add a `useCieloTransactions` query hook in `src/hooks/quickApi/`, keyed by
  the selected business, page, and page size.
- Columns, in order:

  | Column     | Content                                 |
  | ---------- | --------------------------------------- |
  | Data       | `received_date` in pt-BR date and time. |
  | Valor      | `amount` in cents, formatted as BRL.    |
  | Bandeira   | `brand`, or `—` when `null`.            |
  | Tipo       | `payment_type.label`.                   |
  | Adquirente | `provider`, or `—` when empty.          |
  | Status     | `status.label`.                         |

- Paginate on the server with Material UI `TablePagination`, like the
  businesses list.
- Show loading and error states. A business without transactions, including
  one without a Cielo seller, shows the empty table with a short message.
- Show all statuses.
- Make the table usable on `xs`: horizontal scroll inside the table container,
  never on the page.

## Mock Cielo API

Extend `local-mock-cielo/`. Like the earlier mock work, this code never
reaches production and is ignored by Git: do not add tests for it.

### Lookup endpoint

- Add `GET /1/sales/:paymentId`, protected by the existing
  `requireBearerToken` middleware.
- Store generated transactions in a new SQLite table `transactions`
  (`payment_id` primary key, `merchant_id`, `created_at`, and the full
  response JSON).
- Return `200` with the stored response, or `404` with a Cielo-style error
  array for an unknown payment ID.

### Notification script

- Add an npm script `notify:transaction` that runs a compiled script
  (`dist/scripts/send-transaction-notification.js`); the runtime image has no
  dev dependencies, so do not rely on `tsx`. Run it with:

  ```bash
  docker compose exec mock-cielo npm run notify:transaction
  ```

- Without arguments, each run generates one random transaction, stores it,
  and sends one notification with `ChangeType` `1` for its `PaymentId`.
- With `--payment-id <id>`, the run loads that stored transaction, changes its
  `Payment.Status` to a different random status allowed for its type, saves
  it, and sends a `ChangeType` `1` notification for it, so the backend's
  update path can be exercised. Every other field, including `ReceivedDate`,
  stays unchanged. An unknown payment ID exits with a clear error. Pass the
  argument through npm:

  ```bash
  docker compose exec mock-cielo npm run notify:transaction -- --payment-id <id>
  ```

- The script prints the `PaymentId` it notified.
- Generate the response in the lookup sample's shape:
  - `MerchantId` from `MOCK_CIELO_TRANSACTION_MERCHANT_ID`.
  - A random `Payment.Type` among `CreditCard`, `DebitCard`, `Pix`, and
    `Boleto`.
  - For card types, a `CreditCard` or `DebitCard` node with a masked number,
    holder, and a random `Brand`.
  - `Installments` between 1 and 12 for credit; omitted otherwise.
  - A random `Amount` in cents, `Provider` `Simulado`, and `ReceivedDate` as
    the current `America/Sao_Paulo` time in `YYYY-MM-DD HH:MM:SS`.
  - A random `Status` that Cielo's status list allows for the type, for
    example never `Voided` for Pix or boleto.
  - A `Customer` node, so the backend's sanitization is exercised.
  - `IsSplitted: false` and no `SplitPayments`.
- Deliver with the existing retry behavior (three attempts until `200`) and
  structured delivery logs, reusing the onboarding delivery code. Never log
  the token.
- Exit with a clear error when the merchant ID or URL is not configured.

### Configuration

| Variable                                  | Purpose                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `MOCK_CIELO_TRANSACTION_NOTIFICATION_URL` | Destination, for example `http://web:8000/cielo/transactions/notifications/`. |
| `MOCK_CIELO_TRANSACTION_MERCHANT_ID`      | `MerchantId` of generated transactions; set it to a seller's merchant ID.     |
| `MOCK_CIELO_NOTIFICATION_TOKEN`           | Existing variable, reused as `X-Cielo-Webhook-Token`.                         |

Add the new variables to `local-mock-cielo/.env.example`,
`local-mock-cielo/docker-compose.dev.yml`, and `local-mock-cielo/README.md`.
Change the onboarding example `MOCK_CIELO_NOTIFICATION_URL` in the same files
to `http://web:8000/cielo/onboarding/notifications/`.

## Documentation

- Add `quick-docs/cielo/transactions.md` documenting the endpoints,
  authentication, processing and lookup rules, stored fields, sanitization,
  choices, the list response, settings, and the mock workflow. Link it from
  `quick-docs/cielo/index.md` and the Cielo sidebar in
  `quick-docs/.vitepress/config.mts`.
- Update `quick-docs/cielo/onboarding-status.md` for the model rename and the
  new endpoint path.
- Update `quick-docs/cielo/plans.md` for the `Master` brand value.

## Implementation sequence

1. Rename the onboarding notification model, its code, and its endpoint path;
   generate the migration.
2. Rename the `MasterCard` brand to `Master` in the backend and the Cielo
   plans frontend; generate the migration.
3. Add the choices, `CieloTransaction`, and `CieloTransactionNotification`;
   generate migrations.
4. Add `CIELO_QUERY_BASE_URL` to settings, the configuration, `.env.example`,
   and both backend Compose files.
5. Add the lookup client, transaction services, notification and list views,
   URLs, serializers, and read-only admin.
6. Replace the `/sales` page and add the query hook.
7. Extend the mock Cielo API.
8. Write the documentation.
9. Add the tests below.
10. Run verification:

    ```bash
    # From the repository root
    docker compose exec -T web python manage.py makemigrations cielo
    docker compose exec -T web python manage.py migrate
    docker compose exec -T web ruff check
    docker compose exec -T web python manage.py test cielo

    # From quick-portal-web/
    npm test
    npm run lint
    npm run build
    ```

## Test plan

This is the complete and exclusive list of new automated tests. Existing
onboarding notification and Cielo plan tests are updated for the renames,
not extended. Mock the Cielo HTTP calls; never call the real API.

Backend tests for `POST /cielo/transactions/notifications/`:

- A missing or invalid token returns `401` and stores nothing.
- A missing `CIELO_WEBHOOK_TOKEN` returns `500` and stores nothing.
- A malformed payload (not an object, invalid `PaymentId`, invalid
  `ChangeType`) returns `400` and stores nothing.
- `ChangeType` `1` for a new payment with a successful lookup creates the
  notification and a transaction with every field mapped, `cielo_business`
  matched by `MerchantId`, `received_date` converted from São Paulo time, and
  `lookup_status = SUCCESS`.
- `ChangeType` `1` for an existing payment updates the same transaction and
  adds a second notification linked to it.
- `ChangeType` `25` triggers a lookup exactly like `1`.
- A failed lookup for a new payment creates a transaction with only
  `payment_id` and the failure fields, and returns `200`. Cover a non-`200`
  response and a timeout.
- A failed lookup for an existing payment keeps every previous value and
  changes only `lookup_status`, `last_lookup_at`, and `lookup_error`.
- A successful lookup after a failure clears `lookup_error`.
- A change type outside `LOOKUP_CHANGE_TYPES` stores the notification,
  performs no lookup, and links it to an existing transaction when there is
  one.
- A `SplittedCreditCard` lookup stores its type and brand and is labelled
  `Crédito`.
- The stored `raw_response` has no `Customer`, `Payment.CreditCard`, or
  `Payment.DebitCard`, and has `Payment.Brand`.
- Pix and boleto lookups store `brand = null`; a lookup without
  `Installments` stores `1`.
- A `MerchantId` with no matching seller stores the transaction with
  `cielo_business = null`.
- Unlisted `Status` and `Type` values are stored unchanged.
- Transaction notifications cannot be updated or deleted.

Backend tests for `GET /cielo/transactions/`:

- Returns only the selected business's transactions, newest first, excluding
  child businesses' transactions and transactions never looked up
  successfully.
- A transaction whose latest lookup failed after a success is still listed.
- An inaccessible business returns `404`; a missing `business` parameter
  returns `400`.
- A business without a Cielo seller returns an empty page.
- Unlisted status and payment type values use the `Desconhecido (<value>)`
  label.

Frontend tests for the `/sales` page:

- Renders the six columns with formatted date, BRL value, brand or `—`, type
  label, provider, and status label.
- Requests the selected business and changes page through `TablePagination`.
- Shows the empty state when the API returns no transactions.
- Shows the error state when the request fails.
