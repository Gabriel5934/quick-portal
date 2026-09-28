# Onboarding Status

Cielo sends notifications about updates to the status of a seller's onboarding
process. Each notification is a POST request, and Cielo expects the endpoint to
return HTTP 200 OK. If it does not receive 200 OK, Cielo makes two more attempts
to send the notification.

Every notification payload includes the type of change, the master merchant ID,
and a data object containing the seller's merchant ID. The table below describes
the possible types of change:

| Change Type | Description  |
| ----------- | ------------ |
| 20          | KYC          |
| 21          | Bank Account |
| 23          | Onboarding   |

## When each notification is sent

- KYC notification: from a few minutes up to 15 days after the onboarding
  starts.
- Bank account notification: around 2 business days after the onboarding
  starts.
- Onboarding notification: after each of the previous notifications.

## Authentication

Every custom header sent when the notification URL was configured is sent back
with each notification request.

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

| Status | Name                    |
| ------ | ----------------------- |
| 1      | UnderAnalysis           |
| 2      | Approved                |
| 3      | ApprovedWithRestriction |
| 4      | Rejected                |

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

| Status | Name          |
| ------ | ------------- |
| 0      | InternalError |
| 1      | Created       |
| 2      | Processing    |
| 3      | Success       |
| 4      | Error         |

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

| Status | Name                   |
| ------ | ---------------------- |
| 1      | UnderAnalysis          |
| 2      | Approved               |
| 3      | AwaitingMerchantAction |
| 4      | Unknown                |
| 5      | Banned                 |

`KycAnalysisInfo.Status` and `BankAccountValidation.Status` use the KYC and
Bank Account status tables above.
