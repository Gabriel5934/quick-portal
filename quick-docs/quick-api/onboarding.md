# Onboarding
Related doc: [Cielo Seller Onboarding](../cielo/seller-onboarding)

One of the features in Cielo Split API is the onboarding of sellers so they can participate in payment split.

Quick API acts like a gateway for this endpoint by receiving the payload, authenticating and making the request to Cielo and only after a successful creating our own entry for the seller on our database.
## Workflow
- Quick API receives an onboarding request
- Quick API requests Cielo's Split API onboarding endpoint
- Quick API logs the response from Cielo
- If the response was successful we save  the newly onboarded seller `Id` and `DocumentNumber` and return `Id` `DocumentNumber` and `DocumentType` in a 200 OK response
- If not we return `status` and `title` in a 200 OK response
## Model Mapping
### IntEnums

| cielo_bank_account_type | Label           |
| ----------------------- | --------------- |
| 1                       | CheckingAccount |
| 2                       | SavingsAccount  |
### Models
**cielo_requests**

| Field        | Type                 | Notes |
| ------------ | -------------------- | ----- |
| requested_at | UTCDateTime (custom) |       |
| status       | String               |       |
| title        | String               |       |
**cielo_sellers**

| Field           | Type                    | Notes |
| --------------- | ----------------------- | ----- |
| id              | Uuid                    |       |
| document_number | String                  |       |
| document_type   | cielo_bank_account_type |       |
