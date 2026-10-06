# Onboarding Status

Cielo sends notifications about updates to the status of a seller's onboarding
process. Each notification is a POST request, and Cielo expects the endpoint to
return HTTP 200 OK. If it does not receive 200 OK, Cielo makes two more attempts
to send the notification.

Every notification payload includes the type of change, the master merchant ID,
and a data object containing the seller's merchant ID. The table below describes
the possible types of change:

| Change Type | Description  | Quick Portal label |
| ----------- | ------------ | ------------------ |
| 20          | KYC          | KYC                |
| 21          | Bank Account | Conta bancária     |
| 23          | Onboarding   | Credenciamento     |

## When each notification is sent

- KYC notification: from a few minutes up to 15 days after the onboarding
  starts.
- Bank account notification: around 2 business days after the onboarding
  starts.
- Onboarding notification: after each of the previous notifications.

## Authentication

Every custom header sent when the notification URL was configured is sent back
with each notification request.

## Quick Portal endpoint

Quick Portal receives notifications at `POST /cielo/onboarding/notifications/`.
Registering this URL with Cielo is done outside Quick Portal.

Because Cielo retries any response other than `200`, the endpoint returns an
error only when retrying could help or the request must not be accepted. Only
accepted notifications (`200`) are stored.

### Authentication

Register the notification URL with the custom header
`X-Cielo-Webhook-Token: <token>`. Quick Portal reads the expected token from
`CIELO_WEBHOOK_TOKEN` and compares it in constant time. The endpoint does not
use JWT authentication or the `Authorization` header.

### Checks and order

The endpoint runs the checks below in order and returns the first one that
fails:

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

### Responses

#### 500 Internal Server Error

Returned when Quick Portal is not configured to receive notifications:
`CIELO_WEBHOOK_TOKEN` or `CIELO_MERCHANT_ID` is missing or blank. No other check
runs.

```json
{ "detail": "Cielo notifications are not configured." }
```

The error is logged. Cielo's retries can succeed once the environment variables
are set.

#### 401 Unauthorized

Returned when the `X-Cielo-Webhook-Token` header is missing or does not match
`CIELO_WEBHOOK_TOKEN`. The token is never logged.

```json
{ "detail": "Invalid notification token." }
```

The body is not parsed before this check, so a request with an invalid token
returns `401` even when its body is malformed.

#### 403 Forbidden

Returned when the payload is a JSON object whose `MasterMerchantId` is missing
or differs from `CIELO_MERCHANT_ID`. The notification belongs to another master
merchant and is not stored.

```json
{ "detail": "Unknown master merchant." }
```

A body that is valid JSON but not an object skips this check and returns `400`.

#### 400 Bad Request

Returned when the body cannot be read as a notification. The `detail` message
names the invalid field. This happens when:

- The body is not valid JSON.
- The payload is not a JSON object.
- `ChangeType` is missing or is not a non-negative integer.
- `Data` is missing or is not an object.
- The seller merchant ID is missing, empty, not a string, or longer than 36
  characters. See `merchant_id` in [Stored fields](#stored-fields) for where it
  is read from.
- `Data.Status` is missing in a KYC (20) or bank-account (21) notification.
- In an onboarding notification (23), `Data.KycAnalysisInfo` or
  `Data.BankAccountValidation` is present but not an object.
- A status that is present is not an integer between 0 and 32767. Booleans are
  rejected.

```json
{ "detail": "Data.Status must be a non-negative integer." }
```

In an onboarding notification, an omitted or `null` status is not an error; see
[Partial onboarding notifications](#partial-onboarding-notifications).

#### 200 OK

Returned when the notification passes every check. It is stored as a
`CieloOnboardingNotification` record, including when:

- No seller matches the merchant ID. This includes a bank-account notification
  for the master merchant itself.
- `ChangeType` is not 20, 21, or 23. The seller is not looked up.
- A status value is not in Quick Portal's status tables. See
  [Unlisted status values](#unlisted-status-values).
- The same notification was already received. See
  [Notification ordering](#notification-ordering).

Notifications without a matching seller or with an unknown `ChangeType` are
stored without a seller and logged. They return `200` because retrying would
not change the result.

```json
{}
```

#### Other statuses

Django REST Framework can also return two other statuses. It returns
`405 Method Not Allowed` for a method other than `POST`, before any check runs.
It returns `415 Unsupported Media Type` for a body that is not
`application/json`, at step 3 after the token check.

### Processing

Every accepted notification is stored as an immutable
`CieloOnboardingNotification` record (table `cielo_onboarding_notifications`).
Quick Portal then looks up the seller by `merchant_id` and updates its statuses,
using the notification's reception time as the update timestamp:

| Change Type | Seller fields updated                                                                 |
| ----------- | ------------------------------------------------------------------------------------- |
| 20          | `kyc_status`                                                                          |
| 21          | `bank_account_status`                                                                 |
| 23          | Whichever of `onboarding_status`, `kyc_status`, and `bank_account_status` it provides |

Each status has its own `*_updated_at` timestamp. Notifications never change the
seller's submission status or retry rules. If the matched seller fails model
validation, the notification is still stored and answered with `200`, but its
statuses are not applied and an error is logged.

### Sellers without a merchant ID

Notifications identify the seller only by its Cielo merchant ID. If Cielo
registers a seller but Quick Portal never reads the response, for example after
a read timeout, the seller stays `FAILED` or `INTERVENTION_REQUIRED` without a
merchant ID. Its notifications match no seller: they are stored without a
seller and do not update its statuses. Quick Portal does not reconcile these
sellers automatically; the stored notifications can be found in the Django
admin by merchant ID.

**Why:** Linking such a seller requires looking the merchant up at Cielo, which
is out of scope for the MVP.

### Partial onboarding notifications

Every status in an onboarding notification (23) is optional. An omitted or
`null` `OnboardingStatus`, `KycAnalysisInfo`, `KycAnalysisInfo.Status`,
`BankAccountValidation`, or `BankAccountValidation.Status` counts as not
provided: the notification is accepted, stores `null` for that status, and
leaves the seller's current value and its `*_updated_at` timestamp unchanged.
A status that is present but not an integer is still malformed and returns
`400`.

**Why:** Cielo sends an onboarding notification after either the KYC or the
bank-account notification, so one of the sub-statuses may not exist yet.
Rejecting such a payload would lose the statuses it does carry, because Cielo
stops retrying after two more attempts. Overwriting the seller with `null`
would instead erase a status Quick Portal already received.

### Unlisted status values

A status that is a valid integer but not one of the documented values is
accepted and stored as-is on the `CieloOnboardingNotification` record. It is
not copied to the seller: that seller field and its `*_updated_at` timestamp
keep their previous values, and a warning is logged. Other statuses in the same
notification are still applied.

**Why:** The seller's status fields only accept documented values. Saving an
unlisted value would make the seller fail model validation, which would block
retries after a failed submission.

### Notification ordering

::: warning Stale retries are not rejected
Notifications carry no timestamp or sequence number, so Quick Portal cannot
tell whether a notification is older than the status it already stored. Each
notification overwrites the statuses it provides, and each `*_updated_at`
records when Quick Portal received that status, not when Cielo changed it.
Duplicate deliveries create duplicate records and are applied again in arrival
order.

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
`CieloOnboardingNotification` history in the Django admin: every notification
is stored immutably in the order it was received.
:::

### Stored fields

| Field                 | Source                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cielo_business`      | The seller matching the merchant ID, or null.                                                                                                                        |
| `change_type`         | `ChangeType`.                                                                                                                                                        |
| `merchant_id`         | `Data.SubordinateMerchantId` for change types 20 and 23; `Data.MerchantId` for 21. For other types, `Data.SubordinateMerchantId` if present, else `Data.MerchantId`. |
| `kyc_status`          | `Data.Status` for 20; `Data.KycAnalysisInfo.Status` for 23.                                                                                                          |
| `bank_account_status` | `Data.Status` for 21; `Data.BankAccountValidation.Status` for 23.                                                                                                    |
| `onboarding_status`   | `Data.OnboardingStatus` for 23.                                                                                                                                      |
| `received_at`         | Set when the notification is stored.                                                                                                                                 |

The raw payload and bank-account data (account, agency, document, and bank
code) are not stored. Records cannot be updated or deleted, and the Django
admin shows them read-only.

The seller summary API returns each status as
`{ "value": <n>, "label": "<label>" }`, or `null` before its first
notification. The notification history is not exposed through the API.

## KYC

**Sample Payload**

```json
{
  "ChangeType": 20,
  "MasterMerchantId": "96ffb8be-6693-4f9b-bf8e-925b555b3207",
  "Data": {
    "SubordinateMerchantId": "4d76b525-e66d-402e-a318-5fd3ce1af7aa",
    "Status": 2
  }
}
```

**Status**

| Status | Name                    | Quick Portal label     |
| ------ | ----------------------- | ---------------------- |
| 1      | UnderAnalysis           | Em análise             |
| 2      | Approved                | Aprovado               |
| 3      | ApprovedWithRestriction | Aprovado com restrição |
| 4      | Rejected                | Rejeitado              |

## Bank Account

**Sample Payload**

```json
{
  "ChangeType": 21,
  "MasterMerchantId": "96ffb8be-6693-4f9b-bf8e-925b555b3207",
  "Data": {
    "MerchantId": "4d76b525-e66d-402e-a318-5fd3ce1af7aa",
    "MerchantType": "Subordinate",
    "Status": 3,
    "AccountNumber": "123",
    "AccountDigit": "1",
    "AgencyNumber": "3581",
    "AgencyDigit": "x",
    "CompeCode": "260",
    "BankAccountType": 1,
    "DocumentNumber": "45224563215",
    "DocumentType": 2
  }
}
```

**Status**

| Status | Name          | Quick Portal label |
| ------ | ------------- | ------------------ |
| 0      | InternalError | Erro interno       |
| 1      | Created       | Criado             |
| 2      | Processing    | Em processamento   |
| 3      | Success       | Sucesso            |
| 4      | Error         | Erro               |

## Onboarding

**Sample Payload**

```json
{
  "ChangeType": 23,
  "MasterMerchantId": "96ffb8be-6693-4f9b-bf8e-925b555b3207",
  "Data": {
    "SubordinateMerchantId": "4d76b525-e66d-402e-a318-5fd3ce1af7aa",
    "OnboardingStatus": 2,
    "KycAnalysisInfo": {
      "Status": 2
    },
    "BankAccountValidation": {
      "Status": 3
    }
  }
}
```

**Status**

| Status | Name                   | Quick Portal label         |
| ------ | ---------------------- | -------------------------- |
| 1      | UnderAnalysis          | Em análise                 |
| 2      | Approved               | Aprovado                   |
| 3      | AwaitingMerchantAction | Aguardando ação do lojista |
| 4      | Unknown                | Desconhecido               |
| 5      | Banned                 | Banido                     |

`KycAnalysisInfo.Status` and `BankAccountValidation.Status` use the KYC and
Bank Account status tables above.
