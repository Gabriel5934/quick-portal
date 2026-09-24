# Cielo

## Glossary

**Seller**: A seller is every merchant other than the master merchant. In Quick
Portal this includes resellers, re-resellers, and stores. Those business types
are Quick Portal concepts and do not exist in Cielo.

**Master**: The master is the main merchant and the only merchant able to create
sellers. For this integration, the master is Quick Digital.

**Merchant**: A merchant may be the master or a seller; both are identified by
merchant IDs.

**Quick Portal relationship**: Every Cielo seller has a one-to-one relationship
with an existing generic Quick Portal `Business`. A generic business may have
at most one Cielo seller. Access to a Cielo seller follows access to that
underlying business.

## Auth

Authentication is token-based. Obtain an access token from Cielo's OAuth2
endpoint and cache it according to the returned `expires_in` value.

The application must not infer a default environment. Configure the two API
base URLs independently:

| Environment variable        | Purpose                            |
| --------------------------- | ---------------------------------- |
| `CIELO_AUTH_BASE_URL`       | OAuth2 authentication API base URL |
| `CIELO_ONBOARDING_BASE_URL` | Seller onboarding API base URL     |

| Env        | Method | Endpoint                           |
| ---------- | ------ | ---------------------------------- |
| Sandbox    | post   | `CIELO_AUTH_BASE_URL`/oauth2/token |
| Production | post   | `CIELO_AUTH_BASE_URL`/oauth2/token |

| Header        | Value                                     |
| ------------- | ----------------------------------------- |
| Content-Type  | application/x-www-form-urlencoded         |
| accept        | application/json                          |
| Authorization | Basic `<base64(MerchantId:ClientSecret)>` |

Read `MerchantId` from `CIELO_MERCHANT_ID` and `ClientSecret` from
`CIELO_CLIENT_SECRET`. Join them with a colon, encode the result as Base64, and
send it in the `Authorization` header. Use the same `CIELO_MERCHANT_ID` as the
onboarding payload's `MasterMerchantId`.

**Body**

`grant_type=client_credentials`

**200 result**

```json
{
  "access_token": "ey...XHg",
  "token_type": "bearer",
  "expires_in": 86399
}
```

**400 result**

```json
{
  "error": "invalid_client",
  "error_description": "A aut..."
}
```

## Onboarding

| Env        | Method | Endpoint                                  |
| ---------- | ------ | ----------------------------------------- |
| Sandbox    | post   | `CIELO_ONBOARDING_BASE_URL`/api/merchants |
| Production | post   | `CIELO_ONBOARDING_BASE_URL`/api/merchants |

| Header        | Value                   |
| ------------- | ----------------------- |
| Content-Type  | application/json        |
| accept        | application/json        |
| Authorization | Bearer `<access_token>` |

### Body

#### `Type` _required_

Hardcoded: 'Subordinate'

#### `MasterMerchantId`

String. Quick's merchant id, 36 characters long. Stored in an environment variable. Even though it is not required it is always sent.

#### `ContactPhone` _required_

String. Phone number of the person responsible for the seller. Numeric string. 11 characters long. \
Frontend mask: (XX) XXXXX-XXXX

#### `ContactName` _required_

String. Name of the person responsible for the seller. Maximum of 100 characters.

#### `MailAddress` _required_

String. Business email address of the seller. Maximum of 50 characters.

#### `Website`

String. Business website address of the seller. Maximum of 200 characters.

#### `DocumentType` _required_

String. Either "CPF" or "CNPJ"

#### `DocumentNumber` _required_

- CPF \
  Numeric string, 11 characters long \
  Mask: XXX.XXX.XXX-XX \
  Mathematical validation

- CNPJ \
  Alphanumeric string, 14 characters long \
  Mask: XX.XXX.XXX/XXXX-XX \
  Mathematical validation

#### `CorporateName` _required_

Legal name of the company behind the seller. Maximum of 100 characters.

- CPF
  - Copies the value of `ContactName`
  - Frontend: not displayed
- CNPJ
  - Fetches `razao_social` from BrasilAPI
  - Frontend: disabled, presentation only field

#### `FancyName` _required_

Trade name of the company behind the seller, maximum of 50 characters

- CPF
  - Copies the value of `ContactName`
  - Frontend: not displayed
- CNPJ
  - Fetches `nome_fantasia` from BrasilAPI
  - Frontend: disabled, presentation only field

#### `BirthdayDate` _only required when DocumentType is "CPF"_

Date string in the yyyy-MM-dd format

#### `BusinessActivityId` _only required when DocumentType is "CPF"_

String. Id of the business activity. Sourced from [Cielo Docs](https://docs.cielo.com.br/split/reference/lista-de-ramos-de-atividades)

CPF onboarding does not send attachments in this integration.

#### `BankAccount.Bank` _required_

Numeric string. Bank code. Sourced from [Cielo Docs](https://docs.cielo.com.br/split/reference/lista-de-c%C3%B3digos-de-compensa%C3%A7%C3%A3o)

#### `BankAccount.BankAccountType` _required_

String. Either "CheckingAccount" or "SavingsAccount"

#### `BankAccount.Number` _required_

Numeric string. Account number. Maximum of 10 characters

#### `BankAccount.Operation`

Numeric string. Account number. Maximum of 10 characters
We do not ask the user nor send this field

#### `BankAccount.VerifierDigit` _required_

Numeric string. Account digit. Maximum of 1 character.

#### `BankAccount.AgencyNumber` _required_

Numeric string. Agency number. Maximum of 4 characters. Inputs containing only 0 are invalid.

#### `BankAccount.AgencyDigit` _required_

Numeric string or "x". Account digit. Maximum of 1 character. Not required on the frontend, when not provided defaults to "x"

#### `BankAccount.DocumentType` _required_

String. Either "CPF" or "CNPJ"

#### `BankAccount.DocumentNumber` _required_

- CPF \
  Numeric string, 11 characters long \
  Frontend Mask: XXX.XXX.XXX-XX \
  Mathematical validation

- CNPJ \
  Alphanumeric string, 14 characters long \
  Frontend Mask: XX.XXX.XXX/XXXX-XX \
  Mathematical validation

The bank-account document is validated independently and may differ from the
seller's `DocumentNumber`.

#### `Address.Number` _required_

Numeric String. Maximum of 15 characters.

#### `Address.Complement`

String. Optional second line of the address. Maximum of 80 characters.

#### `Address.ZipCode` _required_

Numeric string. Maximum of 9 characters. Used to fetch address data from
BrasilAPI.

#### `Address.Street` _required_

String. Maximum of 100 characters. Fetched from BrasilAPI `street` field.

#### `Address.Neighborhood` _required_

String. Maximum of 50 characters. Fetched from BrasilAPI `neighborhood` field.

#### `Address.City` _required_

String. Maximum of 50 characters. Fetched from BrasilAPI `city` field.

#### `Address.State` _required_

String. Maximum of 2 characters. Fetched from BrasilAPI `state` field.

#### `Agreements`

This field is not used by us

### Outbound payload example

Build the Cielo request with its documented PascalCase names. Do not send
`Operation` or `Agreements`.

```json
{
  "Type": "Subordinate",
  "MasterMerchantId": "f88cc14d-c796-4939-957e-de4dddcb2257",
  "ContactPhone": "11987654321",
  "ContactName": "Seller Contact",
  "MailAddress": "seller@example.com",
  "Website": "https://example.com",
  "DocumentType": "CNPJ",
  "DocumentNumber": "12BC34501DE35",
  "CorporateName": "Seller Corporate Ltda",
  "FancyName": "Seller",
  "BankAccount": {
    "Bank": "001",
    "BankAccountType": "CheckingAccount",
    "Number": "1234567890",
    "VerifierDigit": "1",
    "AgencyNumber": "1234",
    "AgencyDigit": "x",
    "DocumentType": "CPF",
    "DocumentNumber": "52998224725"
  },
  "Address": {
    "Number": "123",
    "Complement": "",
    "ZipCode": "01001000",
    "Street": "Praça da Sé",
    "Neighborhood": "Sé",
    "City": "São Paulo",
    "State": "SP"
  }
}
```

For CPF sellers, also send `BirthdayDate` and `BusinessActivityId`. Omit those
two fields for CNPJ sellers.

## Input normalization

The backend accepts only canonical, unmasked input:

- CPF: 11 numeric characters.
- CNPJ: 14 uppercase alphanumeric characters, with two numeric check digits.
- Phone numbers, bank fields, address number, and ZIP code: no display mask or
  punctuation.

The frontend may display masks but must remove their punctuation before
validation, lookup, and submission. It must uppercase CNPJ letters without
discarding them; alphanumeric CNPJs must not be normalized to digits only.

CPF and CNPJ values must pass mathematical validation in both the frontend and
backend. Validate the seller document and bank-account holder document
independently according to each field's own document type.

For a seller CNPJ, the frontend must complete mathematical validation before
enabling or making the BrasilAPI lookup. An invalid CNPJ must not produce a
BrasilAPI request. A valid lookup populates the managed, read-only
`CorporateName` and `FancyName` fields. A pending or failed lookup prevents the
user from leaving the identification step and displays a form error.

Frontend validation is for immediate feedback and does not replace backend
validation. Before making its own BrasilAPI CNPJ request, the backend
BrasilAPI service must invoke the backend CNPJ validator. A backend validation
or lookup failure prevents a request to Cielo.

## Managed CNPJ fields

Use `GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}` for the CNPJ lookup in
both frontend and backend. The frontend call provides immediate managed-field
feedback; the backend repeats the lookup and its result is authoritative.

For a CNPJ seller, obtain the following fields from BrasilAPI:

| BrasilAPI field | Cielo field     |
| --------------- | --------------- |
| `razao_social`  | `CorporateName` |
| `nome_fantasia` | `FancyName`     |

If `nome_fantasia` is empty, send an empty `FancyName`. Do not fall back to the
corporate name.

For address lookup, the frontend uses
`GET https://brasilapi.com.br/api/cep/v1/{cep}` and maps `street`,
`neighborhood`, `city`, and `state` to their corresponding address fields.
Those four values are managed and read-only. The backend repeats the CEP lookup,
ignores any client-supplied values for those fields, and persists the backend
result as authoritative. A failed or incomplete CEP lookup is a Quick-side
validation failure and prevents the Cielo request.

## Local persistence and status

- A Cielo seller has a one-to-one relationship with a generic Quick Portal
  `Business`. A generic business may have at most one Cielo seller.
- Cielo seller document numbers are unique.
- Do not save incomplete or locally invalid forms. Only locally valid and fully
  enriched sellers are sent to Cielo.
- A failure attributable to Quick must not create or modify a seller. This
  includes local validation failures, local backend failures, invalid or
  missing local configuration, and authentication rejection caused by invalid
  Quick credentials. Return an error that can be displayed on the form.
- A failure attributable to Cielo or communication with Cielo must create the
  locally valid seller in `FAILED`. This includes Cielo `4xx` and `5xx`
  onboarding responses, Cielo service errors, timeouts, connection failures,
  and cases where no onboarding HTTP response is received.
- Save the Cielo response's `MerchantId` after receiving a valid successful
  response. No other Cielo response data needs to be retained.
- Set the local status to `PENDING` for a valid Cielo `2xx` response that
  contains a valid `MerchantId`.
- Set the local status to `FAILED` for any Cielo-side or Cielo-communication
  failure, including `4xx`, `5xx`, timeouts, connection failures, service
  errors, and a missing onboarding response.
- Set the local status to `INTERVENTION_REQUIRED` if Cielo returns an unusable
  `2xx` response. This includes malformed response data and a missing or invalid
  `MerchantId`. Save the seller without a Cielo merchant ID, prevent user
  retry, and indicate that intervention by Quick is required.
- Cielo's asynchronous onboarding notifications and final approval status are
  out of scope. A successfully submitted record remains `PENDING`.

The MVP does not provide general-purpose update or delete operations. It
provides a simple retry operation only for `FAILED`: the endpoint accepts no
edited seller data and resends the form already stored on the Cielo seller.
`PENDING` and `INTERVENTION_REQUIRED` remain distinct, non-retryable statuses:
`PENDING` represents a valid accepted response, while
`INTERVENTION_REQUIRED` represents an unusable successful response that Quick
must investigate.

## Retry flow

The Cielo seller stores `last_submitted_at`. Set or update it only when the
onboarding request is transmitted to Cielo. It records submissions to Cielo,
not attempts that fail within Quick before transmission.

Do not update the timestamp for local validation, configuration,
authentication, DNS, or connection-establishment failures that prevent the
onboarding request from being transmitted. Any HTTP response from the Cielo
onboarding endpoint proves submission and updates the timestamp, whether the
response is `2xx`, `4xx`, or `5xx`.

If the request was transmitted but the response is lost through a read timeout
or connection reset, update `last_submitted_at` because Cielo may still have
received and processed the seller. Only failures known to occur before
transmission leave the timestamp unchanged.

Read the cooldown duration from `CIELO_RETRY_COOLDOWN_SECONDS`, using 300
seconds (five minutes) by default. A retry is allowed only when all of the
following are true:

- The requesting user has access to the underlying generic business.
- The seller status is `FAILED`.
- `last_submitted_at` is null, or at least the configured number of seconds has
  passed since it.

The retry endpoint accepts no seller fields. It rebuilds the Cielo payload from
the persisted seller and sends it unchanged. A retry requested during the
cooldown must not contact Cielo or modify the seller, and the response must tell
the client when retry becomes available. Cooldown enforcement must be atomic so
concurrent requests cannot both reach Cielo.

After an accepted retry:

- A valid Cielo `2xx` response sets `PENDING` and saves `MerchantId`.
- An unusable `2xx` response sets `INTERVENTION_REQUIRED` and disables retry.
- A Cielo-side or communication failure keeps `FAILED` and restarts the
  cooldown from `last_submitted_at` if the request was transmitted. A failure
  before transmission leaves the timestamp unchanged.
- A Quick-side failure leaves the saved form values, status, and
  `last_submitted_at` unchanged.

## Quick Portal model

Implement a `CieloBusiness` model in the `cielo` Django app with database table
`cielo_businesses`. Use a one-to-one `business` field with reverse name
`cielo_business`.

Store these fields directly on the model so the complete Cielo request can be
rebuilt without the frontend:

| Model field                   | Requirement                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `business`                    | Required one-to-one reference to `Business`.                                            |
| `status`                      | Required `CieloSubmissionStatus`: `FAILED`, `PENDING`, or `INTERVENTION_REQUIRED`.      |
| `merchant_id`                 | Nullable/blank, maximum 36 characters. Populated only from a valid onboarding `2xx`.    |
| `last_submitted_at`           | Nullable timezone-aware datetime governed by the transmission and cooldown rules above. |
| `contact_phone`               | Required, exactly 11 digits.                                                            |
| `contact_name`                | Required, maximum 100 characters.                                                       |
| `mail_address`                | Required email, maximum 50 characters.                                                  |
| `website`                     | Optional/blank, maximum 200 characters.                                                 |
| `document_type`               | Required Cielo document-type choice.                                                    |
| `document_number`             | Required canonical CPF/CNPJ, maximum 14 characters, globally unique.                    |
| `corporate_name`              | Required, maximum 100 characters; managed by the backend.                               |
| `fancy_name`                  | Maximum 50 characters and allowed to be blank; managed by the backend.                  |
| `birthday_date`               | Nullable; required only for CPF sellers.                                                |
| `business_activity_id`        | Nullable/blank business-activity choice; required only for CPF sellers.                 |
| `bank`                        | Required bank-code choice stored as a string.                                           |
| `bank_account_type`           | Required account-type choice.                                                           |
| `bank_account_number`         | Required digits, maximum 10 characters.                                                 |
| `bank_account_verifier_digit` | Required digit, exactly one character.                                                  |
| `bank_agency_number`          | Required digits, maximum four characters and not all zeros.                             |
| `bank_agency_digit`           | Required one-character digit or lowercase `x`; default frontend omission to `x`.        |
| `bank_document_type`          | Required Cielo document-type choice.                                                    |
| `bank_document_number`        | Required canonical CPF/CNPJ, maximum 14 characters.                                     |
| `address_number`              | Required digits, maximum 15 characters.                                                 |
| `address_complement`          | Optional/blank, maximum 80 characters.                                                  |
| `address_zip_code`            | Required digits, maximum nine characters.                                               |
| `address_street`              | Required, maximum 100 characters.                                                       |
| `address_neighborhood`        | Required, maximum 50 characters.                                                        |
| `address_city`                | Required, maximum 50 characters.                                                        |
| `address_state`               | Required two-character state code.                                                      |
| `created_at`                  | Automatically set at creation.                                                          |
| `updated_at`                  | Automatically updated.                                                                  |

CPF sellers copy `contact_name` into `corporate_name` and `fancy_name`.
CNPJ sellers ignore client-supplied managed names and overwrite them with the
backend BrasilAPI result. The bank-account document is validated separately and
may differ from the seller document.

## Quick Portal API

All endpoints require JWT authentication. Business lookup uses the existing
hierarchy-aware `get_accessible_business_or_404` helper without filtering by
role, so any authenticated user with access to the business may use the Cielo
flow.

| Method | Route                                    | Result                                                                                 |
| ------ | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET`  | `/cielo/businesses/<business_id>/`       | Seller summary, or `404` for an inaccessible/missing business or missing Cielo seller. |
| `POST` | `/cielo/businesses/<business_id>/`       | Create and submit the business's Cielo seller.                                         |
| `POST` | `/cielo/businesses/<business_id>/retry/` | Retry a `FAILED` seller from persisted values; request body must be empty.             |
| `GET`  | `/cielo/options/document-types/`         | Document choices.                                                                      |
| `GET`  | `/cielo/options/bank-account-types/`     | Bank-account choices.                                                                  |
| `GET`  | `/cielo/options/business-activities/`    | Business-activity choices.                                                             |
| `GET`  | `/cielo/options/banks/`                  | Bank choices.                                                                          |

### Create request

The business comes from the path and must not also be accepted in the body.
Use this snake_case JSON contract:

```json
{
  "contact_phone": "11987654321",
  "contact_name": "Seller Contact",
  "mail_address": "seller@example.com",
  "website": "https://example.com",
  "document_type": "CNPJ",
  "document_number": "12BC34501DE35",
  "birthday_date": null,
  "business_activity_id": null,
  "bank_account": {
    "bank": "001",
    "bank_account_type": "CheckingAccount",
    "number": "1234567890",
    "verifier_digit": "1",
    "agency_number": "1234",
    "agency_digit": "x",
    "document_type": "CPF",
    "document_number": "52998224725"
  },
  "address": {
    "number": "123",
    "complement": "",
    "zip_code": "01001000"
  }
}
```

For CPF, `birthday_date` and `business_activity_id` are required. For CNPJ,
they must be null or omitted. Do not accept `corporate_name`, `fancy_name`,
`address.street`, `address.neighborhood`, `address.city`, `address.state`,
`status`, `merchant_id`, or `last_submitted_at` from the client.

### Seller summary response

Create, detail, and retry return this summary shape:

```json
{
  "id": 1,
  "business": 42,
  "status": "PENDING",
  "merchant_id": "f88cc14d-c796-4939-957e-de4dddcb2257",
  "last_submitted_at": "2026-09-24T15:00:00Z",
  "retry_available_at": null,
  "can_retry": false
}
```

`merchant_id` and both retry timestamps may be null. `can_retry` is true only
for `FAILED` after the cooldown has elapsed or when `last_submitted_at` is null.

- Create returns `201` for every persisted outcome, including `FAILED`.
- An accepted retry returns `200` with the persisted outcome.
- A cooldown rejection returns `429`, sets `Retry-After`, and returns
  `detail`, `retry_after_seconds`, and `retry_available_at`.
- Quick-side errors use normal DRF non-2xx responses and never create a record.
- Do not propagate a Cielo error status after persisting a local seller; return
  the local success status and serialized seller instead.

Each option endpoint returns:

```json
[
  { "value": "CPF", "label": "CPF" },
  { "value": "CNPJ", "label": "CNPJ" }
]
```

Bank and activity values remain strings. Status choices are not exposed.

## Available options

The Cielo app represents all predefined form options with Django
`TextChoices`, rather than database-backed lookup tables. This includes:

- Document type: `CPF` and `CNPJ`.
- Bank account type: `CheckingAccount` and `SavingsAccount`.
- [Business activities](https://docs.cielo.com.br/split/reference/lista-de-ramos-de-atividades).
- [Bank compensation codes](https://docs.cielo.com.br/split/reference/lista-de-c%C3%B3digos-de-compensa%C3%A7%C3%A3o).

Bank-code values must remain strings so leading zeros are preserved. Expose
each user-selectable option list through its own authenticated endpoint so an
input can load only the choices it needs. These endpoints do not expose
internal submission statuses.

Snapshot the values and Portuguese descriptions from the linked Cielo pages
into source-code `TextChoices`. Business-activity values are the documented
string IDs (`"1"` through `"100"`); bank values are the documented three-digit
strings such as `"001"`. Do not scrape Cielo at runtime.

## Frontend flow

The onboarding form has three data-entry steps and a separate review step:

1. **Identification**: contact name, contact phone, email, website, seller
   document type and number, CPF birthday and business activity when applicable,
   and the read-only managed corporate/trade names for CNPJ.
2. **Address**: ZIP code, number, complement, and the read-only street,
   neighborhood, city, and state managed through BrasilAPI CEP.
3. **Bank Account**: bank, account type, account number and verifier digit,
   agency number and digit, and the account holder's document type and number.
4. **Review**: display the canonical payload grouped by the three sections and
   submit it to Quick.

The frontend applies mathematical validation to CPF and CNPJ values before
allowing the user to progress. Only a mathematically valid seller CNPJ may
trigger the BrasilAPI request that populates the managed corporate and trade
names. CPF validation does not trigger a BrasilAPI lookup.

Place the feature under `src/features/cielo/`, with authenticated query and
mutation hooks under `src/hooks/`. Add the route
`/business-list/$id/credenciamento-cielo`; unlike the existing OWN onboarding
route, it must not use the non-store guard because every business type may have
a Cielo seller.

Replace the existing Cielo-unavailable tab on business details:

- With no seller, show a `Credenciar` action to open the onboarding route.
- With a seller, show `status`, `merchant_id`, and `last_submitted_at` when
  available.
- Show retry only for `FAILED` when `can_retry` is true.
- During cooldown, show `retry_available_at` and keep retry disabled.
- Retry calls the empty-body endpoint directly, without reopening the form,
  and refreshes the seller summary in place.
- Quick-side retry errors and cooldown errors remain on the details page and
  display an error there.
- Persisted create outcomes redirect to `/business-list/$id?tab=cielo`; the
  business-details route must use that search parameter to select the Cielo
  tab. A missing Cielo seller (`404` from the detail endpoint) is the normal
  state that displays the onboarding action; other detail errors display an
  error instead.

## Submission result UX

Submission begins from the review step. The frontend handles the result as
follows:

| Result                                                                              | Persisted result        | Frontend behavior                                       |
| ----------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------- |
| Quick validation, configuration, credentials, or backend failure                    | No Cielo seller record  | Remain on the review step and display an error message. |
| Cielo `4xx`/`5xx`, service outage, timeout, connection failure, or missing response | `FAILED`                | Redirect to the underlying business details page.       |
| Malformed Cielo `2xx`                                                               | `INTERVENTION_REQUIRED` | Redirect to the underlying business details page.       |
| Valid Cielo `2xx`                                                                   | `PENDING`               | Redirect to the underlying business details page.       |
