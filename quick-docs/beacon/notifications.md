# Notifications

Related doc: [Cielo/Notifications](../cielo/notifications)

One of the features of Beacon is to provide a POST endpoint to where Cielo Split API can send notifications.

## Notification Type

Beacon is prepared to handle four kinds of notification from Cielo: transaction, global onboarding status, KYC status and bank account validation status. Each notification body is mapped to fields in their respective models. The raw body bytes are also stored.

Notifications types are identified through `ChangeType`:

- 1-8, 25: Transaction
- 20: Onboarding KYC
- 21: Onboarding Bank Account Validation
- 23: Onboarding Global

## Headers

Cielo allows for up to three headers to be configured. To make sure we only accept notifications from Cielo we expect a header with key `X-Cielo-Webhook-Token` that matches the value for env var `CIELO_WEBHOOK_TOKEN`. Any notification request that fails to match that token is rejected and it is not stored.
To compare the header with the configured token `compare_digest` making the comparison constant-time. If the webhook token is missing or incorrect 401 unauthorized is raised.

## Retries

If a notification fails to get a successful response from Beacon, Cielo will retry three more times with a 30 minute interval between each retry. If for some reason a successful notification is retried it should be saved as an ordinary notification in its own row. There is no distinction between first try and retries.

## Model Mapping

Below is a description of how the notification JSON body fields are mapped to their model's fields.

All three different onboarding notification change types have their own model. While all transaction notifications are stored in the same model no matter the change type since they always hold the same schema.

### Malformed notifications

A notification with a valid and mapped `ChangeType` is parsed as its respective model, otherwise it is parsed as the unhandled notification model.

If saving the parsed notification fails, save the raw body to cielo_notification_unhandled and return 200. If that save also fails (for example, a full disk) it throws 500.

### Enums

**cielo_bank**
See [Cielo Banks](./cielo-banks.md)

| cielo_merchant_type | Label       |
| ------------------- | ----------- |
| SUBORDINATE         | Subordinate |
| MASTER              | Master      |

### IntEnums

| cielo_document_type | Label |
| ------------------- | ----- |
| 1                   | CPF   |
| 2                   | CNPJ  |

| cielo_bank_account_type | Label           |
| ----------------------- | --------------- |
| 1                       | CheckingAccount |
| 2                       | SavingsAccount  |

| cielo_onboarding_global_status | Label                  |
| ------------------------------ | ---------------------- |
| 1                              | UnderAnalysis          |
| 2                              | Approved               |
| 3                              | AwaitingMerchantAction |
| 4                              | Unknown                |
| 5                              | Banned                 |

| cielo_onboarding_change_type | Label                   |
| ---------------------------- | ----------------------- |
| 23                           | Global                  |
| 21                           | Bank Account Validation |
| 20                           | KYC                     |

| cielo_transaction_change_type | Label                                  |
| ----------------------------- | -------------------------------------- |
| 1                             | Change in transaction status           |
| 2                             | Recurrence Created                     |
| 3                             | Change in the anti-fraud status        |
| 4                             | Change in the recurring payment status |
| 5                             | Cancelling / refund denied             |
| 6                             | Paid less then the actual boleto value |
| 7                             | Chargeback (legacy)                    |
| 8                             | Fraud alert                            |
| 25                            | Cancelled or refunded partially        |

| cielo_onboarding_kyc_status | Label                   |
| --------------------------- | ----------------------- |
| 1                           | UnderAnalysis           |
| 2                           | Approved                |
| 3                           | ApprovedWithRestriction |
| 4                           | Rejected                |

| cielo_onboarding_bank_account_validation_status | Label         |
| ----------------------------------------------- | ------------- |
| 0                                               | InternalError |
| 1                                               | Created       |
| 2                                               | Processing    |
| 3                                               | Success       |
| 4                                               | Error         |

### Models

**cielo_notification_unhandled**

| JSON Key | Model Field | Type        | Notes            |
| -------- | ----------- | ----------- | ---------------- |
| -        | body        | LargeBinary | Raw request body |
| -        | received_at | DateTime    | timezone=True    |

**cielo_notification_transaction**

| JSON Key           | Model Field          | Type                          | Notes            |
| ------------------ | -------------------- | ----------------------------- | ---------------- |
| PaymentId          | payment_id           | Uuid                          |                  |
| ChangeType         | change_type          | cielo_transaction_change_type |                  |
| RecurrentPaymentId | recurrent_payment_id | Uuid                          |                  |
| -                  | body                 | LargeBinary                   | Raw request body |
| -                  | received_at          | DateTime                      | timezone=True    |

**cielo_notification_onboarding_global**

| JSON Key                          | Model Field                    | Type                                            | Notes            |
| --------------------------------- | ------------------------------ | ----------------------------------------------- | ---------------- |
| ChangeType                        | change_type                    | cielo_onboarding_change_type                    |                  |
| MasterMerchantId                  | master_merchant_id             | Uuid                                            |                  |
| Data.SubordinateMerchantId        | subordinate_merchant_id        | Uuid                                            |                  |
| Data.OnboardingStatus             | status                         | cielo_onboarding_global_status                  |                  |
| Data.KycAnalysisInfo.Status       | kyc_status                     | cielo_onboarding_kyc_status                     |                  |
| Data.BankAccountValidation.Status | bank_account_validation_status | cielo_onboarding_bank_account_validation_status |                  |
| -                                 | body                           | LargeBinary                                     | Raw request body |
| -                                 | received_at                    | DateTime                                        | timezone=True    |

**cielo_notification_onboarding_kyc**

| JSON Key                   | Model Field             | Type                         | Notes            |
| -------------------------- | ----------------------- | ---------------------------- | ---------------- |
| ChangeType                 | change_type             | cielo_onboarding_change_type |                  |
| MasterMerchantId           | master_merchant_id      | Uuid                         |                  |
| Data.SubordinateMerchantId | subordinate_merchant_id | Uuid                         |                  |
| Data.Status                | status                  | cielo_onboarding_kyc_status  |                  |
| -                          | body                    | LargeBinary                  | Raw request body |
| -                          | received_at             | DateTime                     | timezone=True    |

**cielo_notification_onboarding_bank_account_validation**

| JSON Key             | Model Field        | Type                                            | Notes            |
| -------------------- | ------------------ | ----------------------------------------------- | ---------------- |
| ChangeType           | change_type        | cielo_onboarding_change_type                    |                  |
| MasterMerchantId     | master_merchant_id | Uuid                                            |                  |
| Data.MerchantId      | merchant_id        | Uuid                                            |                  |
| Data.MerchantType    | merchant_type      | cielo_merchant_type                             |                  |
| Data.Status          | status             | cielo_onboarding_bank_account_validation_status |                  |
| Data.CompeCode       | bank_code          | cielo_bank                                      |                  |
| Data.BankAccountType | bank_account_type  | cielo_bank_account_type                         |                  |
| Data.AccountNumber   | account_number     | String                                          | Length 15        |
| Data.AccountDigit    | account_digit      | String                                          | Length 5         |
| Data.AgencyNumber    | agency_number      | String                                          | Length 15        |
| Data.AgencyDigit     | agency_digit       | String                                          | Length 5         |
| Data.DocumentNumber  | document_number    | String                                          | Length 15        |
| Data.DocumentType    | document_type      | cielo_document_type                             |                  |
| -                    | body               | LargeBinary                                     | Raw request body |
| -                    | received_at        | DateTime                                        | timezone=True    |
