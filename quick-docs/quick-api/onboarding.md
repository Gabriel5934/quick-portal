---
description: Onboarding sellers through the Quick API
---

# Onboarding

Related doc: [Cielo Seller Onboarding](../cielo/seller-onboarding)

One of the features in Cielo Split API is the onboarding of sellers so they can participate in payment split.

Quick API acts like a gateway for this endpoint by receiving the payload, authenticating and making the request to Cielo and only after a successful creating our own entry for the seller on our database.

If the seller id is missed due to a saving error on our database for example, it is necessary that someone manually access the cielo portal and look up the id.

We foward the request to Cielo in pascal case as defined by their documentation. Quick API uses snake case for our schema.

`bank_account.document_number` and `bank_account.document_type` are ignored if the client sends them, like any other unknown field. The account holder is always the seller, so when building the Cielo payload they are copied from the seller's own `document_number` and `document_type`.

`MasterMerchantId` is not sent by the client, instead we send `CIELO_MERCHANT_ID`.

## URLs

Quick API is internal only, so these are reachable from the compose network (Quick Portal's server functions), not from the internet.

| Environment | Auth   | Method | Path                                    |
| ----------- | ------ | ------ | --------------------------------------- |
| Sandbox     | Bearer | POST   | http://quick-api:8000/cielo/onboard     |
| Sandbox     | Bearer | GET    | http://quick-api:8000/cielo/get-sellers |

## Workflow

- Quick API receives an onboarding request
- Quick API requests Cielo's Split API onboarding endpoint
-
- In case of a 2xx response:
  - We try to save `Id`, `DocumentType`, and `DocumentNumber`. If any of those is missing we throw a 502 error with body: `{message: "Invalid format from Cielo"}`
  - If `Id` already exists we overwrite the row
  - If the response is well-formatted and the save is successful we return 201 created with body including `Id`, `DocumentType`, `DocumentNumber` and `FancyName`
- In case of a 4xx or 5xx response
  - In case of a 401 we trhow a 502 error with body: `{message: "Invalid Cielo Credentials"}` and the cache is cleared
  - Otherwise we bubble the error up to the client
- If any internal errors occur we forward it to the client as usual.

## Get sellers

Returns every seller the current user has access to. Access is direct only: a seller is returned only if there is a `cielo_seller_membership` row for the user, so a user never sees another user's sellers. A seller shared by more than one user is returned to each of them.

- Responds 200 with a JSON array of the same shape as the onboarding 201 body: `[{id, document_type, document_number, fancy_name}]`, with `document_type` as its label (`CPF` or `CNPJ`)
- If the user has no sellers we return an empty array `[]`, not a 404
- Sellers are ordered by the membership's `created_at`, oldest first, then by seller id
- Read-only: Cielo is not called. There is no pagination or filtering

## Model Mapping

### IntEnums

| cielo_document_type | Label |
| ------------------- | ----- |
| 1                   | CPF   |
| 2                   | CNPJ  |

### Models

**cielo_sellers**

| Field           | Type                | Notes      |
| --------------- | ------------------- | ---------- |
| id              | Uuid                | Unique     |
| document_number | String              | Not Unique |
| document_type   | cielo_document_type |            |
| fancy_name      | String(50)          |            |

`fancy_name` is the one sent in the onboarding request, saved together with the seller once Cielo has created it. Onboarding an existing `Id` overwrites it.

## Environment Variables

`CIELO_MERCHANT_ID` - Defines the ID that will be used as `MasterMerchantId` (the same ID used for the token request, see [Cielo Auth](./cielo-auth))

## Ownership

Users are related to sellers trough a membership pivot table. When a seller is successfully onboard (meaning a record was created on our database), a new relationship is created.

**cielo_seller_membership**

| Field     | Type                | Notes |
| --------- | ------------------- | ----- |
| seller_id | FK to cielo_sellers |       |
| user_id   | FK to users         |       |
