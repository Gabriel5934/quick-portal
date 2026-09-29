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

Quick Portal receives notifications at `POST /cielo/notifications/`.
Registering this URL with Cielo is done outside Quick Portal.

### Authentication

Register the notification URL with the custom header
`X-Cielo-Webhook-Token: <token>`. Quick Portal reads the expected token from
`CIELO_WEBHOOK_TOKEN` and compares it in constant time. The endpoint does not
use JWT authentication or the `Authorization` header.

For the status the endpoint returns in each case, see
[Notifications](./notifications.md). Only accepted notifications (`200`) are
stored.

### Processing

Every accepted notification is stored as an immutable `CieloNotification`
record. Quick Portal then looks up the seller by `merchant_id` and updates its
statuses, using the notification's reception time as the update timestamp:

| Change Type | Seller fields updated                                                                 |
| ----------- | ------------------------------------------------------------------------------------- |
| 20          | `kyc_status`                                                                          |
| 21          | `bank_account_status`                                                                 |
| 23          | Whichever of `onboarding_status`, `kyc_status`, and `bank_account_status` it provides |

Each status has its own `*_updated_at` timestamp. Notifications never change the
seller's submission status or retry rules. A notification for an unknown
merchant ID, including a bank-account notification for the master merchant, and
a notification with an unknown `ChangeType` are stored without a seller, logged,
and answered with `200` so Cielo stops retrying. Duplicate deliveries create
duplicate records and are applied again in arrival order, so a delayed duplicate
can replace a newer status. See
[Notification ordering](./notifications.md#notification-ordering).

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
accepted and stored as-is on the `CieloNotification` record. It is not copied
to the seller: that seller field and its `*_updated_at` timestamp keep their
previous values, and a warning is logged. Other statuses in the same
notification are still applied.

**Why:** The seller's status fields only accept documented values. Saving an
unlisted value would make the seller fail model validation, which would block
retries after a failed submission.

### Stored fields

| Field                 | Source                                                                             |
| --------------------- | ---------------------------------------------------------------------------------- |
| `cielo_business`      | The seller matching the merchant ID, or null.                                      |
| `change_type`         | `ChangeType`.                                                                      |
| `merchant_id`         | `Data.SubordinateMerchantId` for change types 20 and 23; `Data.MerchantId` for 21. |
| `kyc_status`          | `Data.Status` for 20; `Data.KycAnalysisInfo.Status` for 23.                        |
| `bank_account_status` | `Data.Status` for 21; `Data.BankAccountValidation.Status` for 23.                  |
| `onboarding_status`   | `Data.OnboardingStatus` for 23.                                                    |
| `received_at`         | Set when the notification is stored.                                               |

The raw payload and bank-account data (account, agency, document, and bank
code) are not stored. Records cannot be updated or deleted, and the Django
admin shows them read-only.

A status value missing from the tables below is stored unchanged. The seller
summary API returns each status as `{ "value": <n>, "label": "<label>" }`, or
`null` before its first notification, and labels an unlisted value
`Desconhecido (<n>)`. The notification history is not exposed through the API.

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
