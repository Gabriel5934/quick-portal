# Notifications

Quick Portal receives Cielo onboarding notifications at
`POST /cielo/notifications/`. This page describes which HTTP status the
endpoint returns for each request. For the payloads, status values, and how
notifications update a seller, see [Onboarding Status](./onboarding-status.md).

Cielo expects `200 OK`. Any other status makes Cielo retry the notification up
to two more times, so the endpoint returns an error only when retrying could
help or the request must not be accepted. Only `200` stores a notification.

## Checks and order

The endpoint does not use JWT authentication. It runs the checks below in
order and returns the first one that fails:

| Order | Check                                                         | Failure status |
| ----- | ------------------------------------------------------------- | -------------- |
| 1     | `CIELO_WEBHOOK_TOKEN` and `CIELO_MERCHANT_ID` are configured  | `500`          |
| 2     | `X-Cielo-Webhook-Token` matches `CIELO_WEBHOOK_TOKEN`         | `401`          |
| 3     | The body is valid JSON                                        | `400`          |
| 4     | `MasterMerchantId` matches `CIELO_MERCHANT_ID`                | `403`          |
| 5     | The payload has the fields required by its `ChangeType`       | `400`          |

A request that passes every check is stored and answered with `200`.

Error responses use the body `{ "detail": "<message>" }`. The success response
body is `{}`.

## 500 Internal Server Error

Returned when Quick Portal is not configured to receive notifications:
`CIELO_WEBHOOK_TOKEN` or `CIELO_MERCHANT_ID` is missing or blank. No other check
runs.

```json
{ "detail": "Cielo notifications are not configured." }
```

The error is logged. Cielo's retries can succeed once the environment variables
are set.

## 401 Unauthorized

Returned when the `X-Cielo-Webhook-Token` header is missing or does not match
`CIELO_WEBHOOK_TOKEN`. The comparison runs in constant time, and the token is
never logged. The `Authorization` header is ignored.

```json
{ "detail": "Invalid notification token." }
```

The body is not parsed before this check, so a request with an invalid token
returns `401` even when its body is malformed.

## 403 Forbidden

Returned when the payload is a JSON object whose `MasterMerchantId` is missing
or differs from `CIELO_MERCHANT_ID`. The notification belongs to another master
merchant and is not stored.

```json
{ "detail": "Unknown master merchant." }
```

A body that is valid JSON but not an object skips this check and returns `400`.

## 400 Bad Request

Returned when the body cannot be read as a notification. The `detail` message
names the invalid field. This happens when:

- The body is not valid JSON.
- The payload is not a JSON object.
- `ChangeType` is missing or is not a non-negative integer.
- `Data` is missing or is not an object.
- The seller merchant ID is missing, empty, not a string, or longer than 36
  characters. It is `Data.SubordinateMerchantId` for change types 20 and 23 and
  `Data.MerchantId` for 21. For an unknown change type, it is
  `Data.SubordinateMerchantId` when present and `Data.MerchantId` otherwise.
- `Data.Status` is missing in a KYC (20) or bank-account (21) notification.
- In an onboarding notification (23), `Data.KycAnalysisInfo` or
  `Data.BankAccountValidation` is present but not an object.
- A status that is present is not an integer between 0 and 32767. Booleans are
  rejected.

```json
{ "detail": "Data.Status must be a non-negative integer." }
```

In an onboarding notification, an omitted or `null` status is not an error; see
[Partial onboarding notifications](./onboarding-status.md#partial-onboarding-notifications).

## 200 OK

Returned when the notification passes every check. It is stored as a
`CieloNotification` record, including when:

- No seller matches the merchant ID. This includes a bank-account notification
  for the master merchant itself.
- `ChangeType` is not 20, 21, or 23. The seller is not looked up.
- A status value is not in Quick Portal's status tables.
- The same notification was already received. Duplicates create another record
  and leave the seller in the same state.

Notifications without a matching seller or with an unknown `ChangeType` are
stored without a seller and logged. They return `200` because retrying would
not change the result.

```json
{}
```

## Other statuses

Django REST Framework can also return two other statuses. It returns
`405 Method Not Allowed` for a method other than `POST`, before any check runs.
It returns `415 Unsupported Media Type` for a body that is not
`application/json`, at step 3 after the token check.

## Notification ordering

::: warning Stale retries are not rejected
Notifications carry no timestamp or sequence number, so Quick Portal cannot
tell whether a notification is older than the status it already stored. Each
notification overwrites the statuses it provides, and each `*_updated_at`
records when Quick Portal received that status, not when Cielo changed it.

A retried notification could therefore overwrite a newer status if Cielo
delivers it after a later notification for the same seller. This is unlikely:

- Cielo retries only when it does not receive `200`. A `400`, `401`, `403`,
  `405`, or `415` fails again on every retry. A retry can succeed only after a
  transient problem on Quick Portal's side, such as an outage or the missing
  configuration behind a `500`, during which a newer notification would
  usually fail as well.
- Status changes for the same seller are minutes to days apart, while Cielo
  gives up after two more attempts.

If a seller shows an unexpected status, compare it with the seller's
`CieloNotification` history in the Django admin: every notification is stored
immutably in the order it was received.
:::
