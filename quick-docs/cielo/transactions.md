# Transactions

Cielo notifies Quick Portal when a payment changes. Quick Portal keeps an
immutable record of every notification, looks the payment up in Cielo's query
API, and stores its current state so users can see their sales on `/sales`.

References:

- [Transaction notification](https://docs.cielo.com.br/split/reference/post-notificacao)
- [Transaction lookup](https://docs.cielo.com.br/split/reference/consultar-transa%C3%A7%C3%B5es)
- [Transaction status list](https://docs.cielo.com.br/split/reference/lista-de-status-da-transa%C3%A7%C3%A3o)

Out of scope: registering the notification URL with Cielo, retrying failed
lookups or re-checking transactions periodically, lookups for change types
other than `1` and `25`, the `Payment.SplitPayments` node, recurrences, and
showing child businesses' transactions.

## Notification endpoint

Quick Portal receives transaction notifications at
`POST /cielo/transactions/notifications/`. This endpoint is separate from the
[onboarding notification endpoint](./onboarding-status.md).

```json
{
  "PaymentId": "507821c5-7067-49ff-928f-a3eb1e256148",
  "ChangeType": 1
}
```

Any other key, including `RecurrentPaymentId`, is ignored.

### Authentication

Authentication is the same as for onboarding notifications: register the URL
with the custom header `X-Cielo-Webhook-Token: <token>`. Quick Portal compares
it in constant time with `CIELO_WEBHOOK_TOKEN` and never logs it. The endpoint
does not use JWT authentication. Transaction notifications carry no
`MasterMerchantId`, so there is no merchant check.

### Checks and order

| Order | Check                                                         | Failure status |
| ----- | ------------------------------------------------------------- | -------------- |
| 1     | `CIELO_WEBHOOK_TOKEN` is configured                           | `500`          |
| 2     | `X-Cielo-Webhook-Token` matches `CIELO_WEBHOOK_TOKEN`         | `401`          |
| 3     | The body is valid JSON                                        | `400`          |
| 4     | The payload is an object                                      | `400`          |
| 5     | `PaymentId` is a UUID string                                  | `400`          |
| 6     | `ChangeType` is an integer between 0 and 32767                | `400`          |

A failed check is logged, stores nothing, and returns
`{ "detail": "<message>" }`. A request that passes every check is stored and
answered with `200` and `{}`, **even when the lookup fails**: Cielo would
otherwise resend the notification and the lookup would fail the same way.

### Processing

1. Authenticate and validate the payload.
2. In one database transaction:
   - For a change type that triggers a lookup, get or create the
     `CieloTransaction` for `PaymentId`. The unique `payment_id` makes
     concurrent notifications for the same payment share one row.
   - For any other change type, find an existing transaction for `PaymentId`,
     if any.
   - Create the `CieloTransactionNotification` linked to that transaction.
3. Commit, so the notification is kept whatever happens during the lookup.
4. For a change type that triggers a lookup only, look the transaction up
   while holding a `select_for_update` lock on its row, so two lookups for the
   same payment cannot overwrite each other out of order.
5. Return `200`.

Change types that trigger a lookup are listed in `LOOKUP_CHANGE_TYPES` in
`cielo/services/transaction_notifications.py`: payment status changes (`1`)
and partial cancellations (`25`).

Duplicate deliveries create duplicate notification rows and repeat the lookup,
which leaves the transaction in Cielo's current state. Out-of-order
notifications need no handling because the lookup always returns the current
state.

## Transaction lookup

Quick Portal calls `GET {CIELO_QUERY_BASE_URL}/1/sales/{PaymentId}` with a
bearer token from Cielo's OAuth endpoint (cached like the onboarding token) and
a 10-second timeout. The lookup runs inside Cielo's webhook request while
holding the transaction's row lock: the timeout turns a hanging query API into
a recorded failure instead of blocking the worker and the lock indefinitely.

### Success

A `200` response with a valid body sets every lookup field (see
[Stored fields](#stored-fields)), links the transaction to the `CieloBusiness`
whose `merchant_id` equals the response's top-level `MerchantId` (or to none,
with a warning log), sets `lookup_status = SUCCESS` and `last_lookup_at`, and
clears `lookup_error`.

::: warning Seller matching
Sellers are matched by the lookup's top-level `MerchantId`. This is a known,
accepted risk: per-seller split data (`SubordinateMerchantId`) is not used.
:::

### Failure

The lookup fails on:

- A configuration or credentials error, or an unavailable OAuth endpoint.
- A connection error or timeout.
- A response other than `200`, or a body that is not a JSON object.
- A `Payment.PaymentId` that differs from the notified one.
- A missing or invalid `MerchantId`, `Payment.Amount`, `Payment.Status`,
  `Payment.Type`, or `Payment.ReceivedDate`.
- A present but invalid `Payment.Installments`, `Payment.Provider`, or card
  `Brand` (for example a value longer than its column).
- Any unexpected error, which is logged with its traceback.

A failure keeps every current lookup field and sets only
`lookup_status = FAILED`, `last_lookup_at`, and a short `lookup_error`, such as
`HTTP 404`, `Timeout`, `Connection error`, `Configuration error`, or
`Invalid response: Payment.Amount`. Response bodies, tokens, and headers are
never stored in `lookup_error`.

A transaction whose first lookup fails therefore exists with only
`payment_id`, `lookup_status = FAILED`, `last_lookup_at`, and `lookup_error`.
The `last_lookup_at` and `lookup_error` fields let retries be added later; there
are none today.

## Stored fields

### `CieloTransactionNotification`

Immutable event, table `cielo_transaction_notifications`. Rows cannot be
updated or deleted, and the Django admin shows them read-only.

| Field         | Source                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `transaction` | The transaction created or found for a lookup change type, or an existing transaction with the same `payment_id` for any other, or null. |
| `payment_id`  | `PaymentId` as sent by Cielo.                                                                                                            |
| `change_type` | `ChangeType`, stored even when unlisted.                                                                                                 |
| `received_at` | Set when the notification is stored.                                                                                                     |

`transaction` is set at creation and never changes.

### `CieloTransaction`

One row per payment, table `cielo_transactions`. Every lookup field is null
until the first successful lookup.

| Field            | Source                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `payment_id`     | Notification `PaymentId`; unique.                                                                               |
| `merchant_id`    | `MerchantId`.                                                                                                   |
| `cielo_business` | The `CieloBusiness` whose `merchant_id` matches, or null.                                                       |
| `installments`   | `Payment.Installments`; `1` when omitted.                                                                       |
| `amount`         | `Payment.Amount`, in cents.                                                                                     |
| `received_date`  | `Payment.ReceivedDate`. Cielo sends `YYYY-MM-DD HH:MM:SS` without a zone; it is read as `America/Sao_Paulo`.    |
| `payment_type`   | `Payment.Type`, stored even when unlisted.                                                                      |
| `brand`          | `Payment.CreditCard.Brand` or `Payment.DebitCard.Brand`; null when neither card node exists (Pix and boleto).   |
| `provider`       | `Payment.Provider`.                                                                                             |
| `status`         | `Payment.Status`, stored even when unlisted.                                                                    |
| `raw_response`   | The sanitized lookup response.                                                                                  |
| `lookup_status`  | `SUCCESS` or `FAILED`; null until the first lookup finishes.                                                    |
| `last_lookup_at` | Time of the last lookup attempt, successful or not.                                                             |
| `lookup_error`   | Short reason for the last failure; blank after a success.                                                       |
| `created_at`     | Set at creation.                                                                                                |
| `updated_at`     | Set on save.                                                                                                    |

The Django admin shows transactions read-only, with a `lookup_status` filter to
find failed lookups.

### Sanitization

Before the lookup response is stored as `raw_response`:

- The top-level `Customer` node is removed.
- `Payment.CreditCard` and `Payment.DebitCard` are removed, and their `Brand`
  is kept as `Payment.Brand` when present.
- Everything else is kept unchanged, including `Payment.SplitPayments`.

## Choices

Labels are pt-BR. Cielo may send a value that is not listed: it is stored
unchanged, choices are never enforced on save, and the API labels it
`Desconhecido (<value>)`.

**Change type** (`CieloTransactionChangeType`)

| Value | Quick Portal label               | Triggers a lookup |
| ----- | -------------------------------- | ----------------- |
| 1     | Mudança de status do pagamento   | Yes               |
| 2     | Recorrência criada               | No                |
| 3     | Mudança de status do antifraude  | No                |
| 4     | Mudança de status da recorrência | No                |
| 5     | Cancelamento negado              | No                |
| 6     | Boleto pago a menor              | No                |
| 7     | Chargeback                       | No                |
| 8     | Alerta de fraude                 | No                |
| 25    | Cancelamento parcial             | Yes               |

**Status** (`CieloTransactionStatus`)

| Value | Cielo name         | Quick Portal label |
| ----- | ------------------ | ------------------ |
| 0     | `NotFinished`      | Não finalizado     |
| 1     | `Authorized`       | Autorizado         |
| 2     | `PaymentConfirmed` | Pago               |
| 3     | `Denied`           | Negado             |
| 10    | `Voided`           | Cancelado          |
| 11    | `Refunded`         | Estornado          |
| 12    | `Pending`          | Pendente           |
| 13    | `Aborted`          | Abortado           |
| 20    | `Scheduled`        | Agendado           |

**Payment type** (`CieloTransactionPaymentType`)

| Value                | Quick Portal label |
| -------------------- | ------------------ |
| `CreditCard`         | Crédito            |
| `DebitCard`          | Débito             |
| `SplittedCreditCard` | Crédito            |
| `SplittedDebitCard`  | Débito             |
| `Pix`                | Pix                |
| `Boleto`             | Boleto             |

Split card transactions still carry their brand in `Payment.CreditCard` or
`Payment.DebitCard`. Mastercard is sent as `Master`, the same value used by
[plan rates](./plans.md).

## Transactions list

`GET /cielo/transactions/?business=<id>` requires JWT authentication and any
role on the selected business. A missing `business` returns `400`, and an
inaccessible business returns `404`.

- Only transactions whose seller is the selected business's own
  `CieloBusiness` are returned; child businesses are never included.
- Only a successful lookup links a transaction to a seller, so transactions
  never looked up successfully are excluded. A transaction whose latest lookup
  failed after an earlier success stays listed with its previous values.
- A business without a Cielo seller returns an empty page.
- Results are ordered by `received_date`, then `id`, newest first.
- Pagination uses `page` and `page_size`: 20 per page by default, at most 100.

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

`raw_response`, the lookup fields, and the notifications are not exposed.

The `/sales` page shows these transactions for the selected business in a
paginated table with the columns Data, Valor, Bandeira, Tipo, Adquirente, and
Status.

## Settings

| Variable               | Purpose                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `CIELO_QUERY_BASE_URL` | Cielo query API: `https://apiquerysandbox.cieloecommerce.cielo.com.br` in sandbox, `https://apiquery.cieloecommerce.cielo.com.br` in production. |
| `CIELO_WEBHOOK_TOKEN`  | Shared with onboarding notifications.                                                                                                           |

`CIELO_QUERY_BASE_URL` has no application default and is validated like the
other Cielo base URLs: it must be HTTPS, except for local hosts in `DEBUG`. It
is required by the production Compose file. The lookup also uses
`CIELO_AUTH_BASE_URL`, `CIELO_MERCHANT_ID`, and `CIELO_CLIENT_SECRET` for its
token.

## Local mock workflow

The local mock Cielo API (`local-mock-cielo/`, not committed) implements
`GET /1/sales/{PaymentId}` and a script that generates transactions and sends
their notifications. With the mock running in the root Compose project:

1. Point the backend's `CIELO_QUERY_BASE_URL` at `http://mock-cielo:3000`
   (never commit this value).
2. In the mock's environment, set `MOCK_CIELO_TRANSACTION_NOTIFICATION_URL` to
   `http://web:8000/cielo/transactions/notifications/`,
   `MOCK_CIELO_TRANSACTION_MERCHANT_ID` to an existing seller's merchant ID, and
   `MOCK_CIELO_NOTIFICATION_TOKEN` to the backend's `CIELO_WEBHOOK_TOKEN`.
3. Generate a transaction and notify it; the script prints its `PaymentId`:

   ```bash
   docker compose exec mock-cielo npm run notify:transaction
   ```

4. Change that transaction's status and notify it again, to exercise the
   update path:

   ```bash
   docker compose exec mock-cielo npm run notify:transaction -- --payment-id <id>
   ```

5. Check the transaction in the Django admin or on `/sales` for the seller's
   business.
