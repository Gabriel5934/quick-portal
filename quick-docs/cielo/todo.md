# Cielo seller onboarding

The high-level goal is to create the Cielo seller onboarding feature end-to-end.
Read `quick-docs/cielo/index.md` to become familiar with the Cielo API before
implementing it.

## Architecture and access

- Cielo-specific backend code must live in a `cielo` Django app.
- All Cielo models and URLs must be prefixed with `cielo`.
- A Cielo seller has a one-to-one relationship with an existing generic
  `Business`. It is not a replacement for the generic business record, and a
  generic business may have at most one Cielo seller.
- Any authenticated user who has access to the underlying generic business may
  view and operate its Cielo onboarding flow.
- A seller document number must be unique across Cielo sellers.

## Authentication and configuration

- The backend must be able to authenticate and make requests to the Cielo API.
- Do not select a default Cielo environment. Read the authentication and
  onboarding base URLs from separate environment variables:
  `CIELO_AUTH_BASE_URL` and `CIELO_ONBOARDING_BASE_URL`.
- Read the Cielo credentials from environment variables. Never commit them.
- Use `CIELO_MERCHANT_ID` for both OAuth authentication and the onboarding
  payload's `MasterMerchantId`. Use `CIELO_CLIENT_SECRET` for OAuth
  authentication.
- Cache the Cielo access token using the `expires_in` value returned by Cielo.
- Add all Cielo variables to Django settings, `.env.example`, and the backend
  Docker/Compose environment wiring. The URL and credential variables are
  required and have no application defaults; missing or blank values are Quick
  configuration errors.
- Never return or log the client secret, Basic authorization value, or access
  token.

## Persistence and submission

- Keep every submitted seller in the local database instead of acting only as
  a gateway to Cielo.
- Do not save incomplete or locally invalid forms. Only call Cielo after local
  validation and any required BrasilAPI enrichment have succeeded.
- Do not create or modify a seller when the failure is attributable to Quick.
  This includes local validation failures, local backend failures, invalid or
  missing local configuration, and rejected authentication caused by invalid
  Quick credentials. Return an error that the frontend can display on the
  form.
- Create the locally validated seller when the failure is attributable to
  Cielo or communication with Cielo. This includes Cielo `4xx` and `5xx`
  onboarding responses, Cielo service errors, timeouts, connection failures,
  and cases where no onboarding HTTP response is received. Set the status to
  `FAILED`.
- On a valid successful Cielo response, retain only the returned `MerchantId`
  as Cielo-specific response data on the seller model.
- An unusable `2xx` response must leave the seller in the non-retryable
  `INTERVENTION_REQUIRED` state. This includes malformed response data and a
  missing or invalid `MerchantId`. The state indicates an integration
  inconsistency that requires intervention by Quick.
- Provide one submission view that submits a new seller to Cielo.
- Provide one retry view for sellers in `FAILED`. The retry request accepts no
  editable seller payload and resends the values already saved on the Cielo
  seller.
- Avoid views with multiple responsibilities whose action is selected by a
  query parameter.
- Do not create general-purpose delete or update views.

## Submission status

Track the local submission status with these three text choices:

- `FAILED`: a locally valid seller could not be successfully submitted because
  of a Cielo-side or Cielo-communication failure. This includes Cielo `4xx` and
  `5xx` responses, service errors, timeouts, connection failures, and a missing
  onboarding response. This status is eligible for the simple retry flow.
- `PENDING`: the seller submission received a valid `2xx` response from Cielo
  containing a valid `MerchantId`.
- `INTERVENTION_REQUIRED`: Cielo returned an unusable `2xx` response, including
  malformed response data or a missing or invalid `MerchantId`. This state
  requires intervention by Quick and is not eligible for user retry.

Cielo onboarding notifications and final KYC/bank-account approval states are
explicitly out of scope. A successfully submitted seller remains `PENDING` in
this feature.

## Retry cooldown

- Add `last_submitted_at` to the Cielo seller model.
- Set or update `last_submitted_at` only when the onboarding request is
  transmitted to Cielo. It records submissions to Cielo, not attempts handled
  only within Quick.
- Do not update `last_submitted_at` for failures that occur before the
  onboarding request is transmitted, including local validation,
  configuration, authentication, DNS, and connection-establishment failures.
- Any HTTP response from the Cielo onboarding endpoint proves that the request
  was submitted and must update `last_submitted_at`, regardless of whether the
  response is `2xx`, `4xx`, or `5xx`.
- If the request was transmitted but Quick receives a read timeout or a
  connection reset before the response, update `last_submitted_at` because
  Cielo may still have received and processed the submission.
- Read the cooldown from `CIELO_RETRY_COOLDOWN_SECONDS`. Use 300 seconds (five
  minutes) as the default value.
- Only a seller in `FAILED` may be retried. `PENDING` and
  `INTERVENTION_REQUIRED` are not retryable.
- A `FAILED` seller with no `last_submitted_at` may be retried immediately
  because no previous onboarding submission is known to have reached Cielo.
- Reject a retry made before the cooldown expires without calling Cielo or
  changing the seller. Return a rate-limit error that tells the client when a
  retry becomes available.
- Enforce the cooldown atomically so concurrent retry requests cannot both
  reach Cielo.
- The retry endpoint resends the persisted form exactly as stored. It does not
  accept edits or rerun the frontend form steps.
- A valid `2xx` retry response changes the seller to `PENDING` and saves the
  returned `MerchantId`.
- An unusable `2xx` retry response changes the seller to
  `INTERVENTION_REQUIRED` and prevents further retries.
- A Cielo-side or communication failure keeps the seller in `FAILED` and the
  cooldown begins from `last_submitted_at` when the request was transmitted.
  If the failure occurred before transmission, the timestamp is unchanged.
- A Quick-side failure does not change the seller's saved form values or
  status and does not update `last_submitted_at`.

## CPF and CNPJ validation

Both CPF and CNPJ sellers are supported from the initial release. Cielo
attachments are not part of this flow, including for CPF sellers.

Create local mathematical validators using these implementations as references:

- https://github.com/opastorello/cpf-validador/blob/master/app/services/cpf.py
- https://github.com/marcelo-lourenco/validador-cnpj-alfanumerico/blob/main/python/cnpj.py
- The referenced CNPJ implementation depends on
  https://github.com/marcelo-lourenco/validador-cnpj-alfanumerico/blob/main/python/dv.py
  for its check-digit calculation; use both as algorithm references.

The validators must support canonical, unmasked values. CNPJ validation must
support alphanumeric CNPJs. Frontend normalization must remove mask punctuation
and convert letters to uppercase without discarding the alphabetic portion of
a CNPJ.

Validate the seller document and bank-account document independently. The bank
account holder's document may differ from the seller's document.

Implement the same mathematical CPF and CNPJ validation rules in the frontend:

- Validate both the seller document and the bank-account holder document.
- Show an inline form error and prevent step progression or submission when a
  document fails mathematical validation.
- For a seller CNPJ, run mathematical validation before enabling or making the
  BrasilAPI lookup. An invalid CNPJ must never produce a BrasilAPI request.
- After a valid seller CNPJ is looked up, display `CorporateName` and
  `FancyName` as managed, read-only form fields.
- A pending or failed seller CNPJ lookup must prevent progression from the
  identification step and display an error on the form.

Frontend validation improves feedback but does not replace backend validation.
The backend must repeat all document validation and remains authoritative.

The BrasilAPI CNPJ service must invoke the local mathematical CNPJ validator
before making a network request. Propagate validation and BrasilAPI lookup
errors to the API view. A BrasilAPI failure always rejects the submission and
must prevent the Cielo request.

For CNPJ sellers, populate the following managed values from BrasilAPI:

- `razao_social` -> `CorporateName`
- `nome_fantasia` -> `FancyName`

If `nome_fantasia` is empty, `FancyName` must remain an empty string.

## Options and choices

- Represent predefined input options with Django `TextChoices`, including the
  Cielo business activities and bank codes documented in
  `quick-docs/cielo/index.md`.
- Preserve leading zeros in bank-code values.
- Provide a separate authenticated endpoint for each user-selectable option
  list so each input can load only the choices it needs.
- Do not expose internal submission statuses through the option endpoints.
- Do not load option data through migrations or database tables.

## Backend implementation contract

- Name the model `CieloBusiness`, use the database table
  `cielo_businesses`, and expose it from the `cielo` Django app.
- Relate it to `Business` with a `OneToOneField` whose reverse name is
  `cielo_business`.
- Store every value required to rebuild the Cielo request directly on
  `CieloBusiness`; do not create generic-business, address, or bank-account
  child models for this MVP.
- Name the status choices `CieloSubmissionStatus` with values `FAILED`,
  `PENDING`, and `INTERVENTION_REQUIRED`.
- Add the `cielo` app to `INSTALLED_APPS` and include its URLs at `/cielo/`.
- Generate migrations from the model with Django `makemigrations`; never hand
  write or edit the migration.
- Resolve business access with the existing
  `quickportal.services.business_access.get_accessible_business_or_404`
  helper without a role filter. Viewer, manager, and administrator access
  inherited through the business hierarchy all qualify, as does superuser
  access.
- Lock the underlying `Business` while creating a Cielo seller so concurrent
  requests cannot bypass the one-to-one or unique-document rules and submit
  duplicates to Cielo.
- Lock the `CieloBusiness` row while evaluating and performing a retry so the
  cooldown check is atomic.

### Quick API routes

All routes require JWT authentication.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/cielo/businesses/<business_id>/` | Return the Cielo seller summary for an accessible generic business. Return `404` when the business is inaccessible, missing, or has no Cielo seller. |
| `POST` | `/cielo/businesses/<business_id>/` | Validate, enrich, submit, and create the one Cielo seller for the business. |
| `POST` | `/cielo/businesses/<business_id>/retry/` | Retry a `FAILED` seller using an empty request body and the persisted values. |
| `GET` | `/cielo/options/document-types/` | Return document-type choices. |
| `GET` | `/cielo/options/bank-account-types/` | Return bank-account-type choices. |
| `GET` | `/cielo/options/business-activities/` | Return business-activity choices. |
| `GET` | `/cielo/options/banks/` | Return bank-code choices. |

The create request uses the snake_case, nested JSON contract documented in
`quick-docs/cielo/index.md`. The retry request must reject seller fields rather
than silently ignoring them.

Every option endpoint returns a JSON array of objects shaped as
`{"value": "...", "label": "..."}`. Keep bank and activity identifiers as
strings. Snapshot the linked Cielo lists as source-code `TextChoices`; do not
fetch those lists at request time.

The seller summary response contains `id`, `business`, `status`, `merchant_id`,
`last_submitted_at`, `retry_available_at`, and `can_retry`. Return it with:

- `201 Created` whenever create persists `FAILED`, `PENDING`, or
  `INTERVENTION_REQUIRED`.
- `200 OK` whenever an accepted retry completes and persists its resulting
  status.
- `429 Too Many Requests` for a retry during cooldown, including a
  `Retry-After` header plus `retry_after_seconds` and `retry_available_at` in
  the JSON response.
- Normal DRF non-2xx validation, authentication, not-found, configuration, or
  server errors when no new record is created.

Do not propagate Cielo's `4xx` or `5xx` status to the frontend after a seller
record has been created. Return the local `201`/`200` result so the frontend can
redirect and render the saved status.

### Failure classification

- Quick faults create no new record: local validation, BrasilAPI validation or
  CNPJ/CEP lookup failure, missing/invalid Quick configuration, Cielo
  `invalid_client` caused by Quick credentials, local payload construction,
  and database or other backend failures.
- Cielo faults create `FAILED`: onboarding `4xx`/`5xx`, Cielo authentication
  service outage/`5xx`/rate limiting/malformed response, DNS and connection
  failures, and a missing onboarding response.
- An unusable onboarding `2xx` creates `INTERVENTION_REQUIRED`.
- A valid onboarding `2xx` with a 36-character `MerchantId` creates `PENDING`.

For retries, a Quick fault leaves the existing record unchanged. A Cielo fault
keeps it in `FAILED`; `last_submitted_at` changes only under the transmission
rules already defined above.

## Frontend form

The seller form must contain three data-entry steps, followed by a separate
review step. Use the exact field grouping documented under "Frontend flow" in
`quick-docs/cielo/index.md`.

The identification step must mathematically validate CPF and CNPJ values in the
browser. For a seller CNPJ, a valid document triggers the BrasilAPI lookup used
to populate the managed `CorporateName` and `FancyName` fields. The lookup must
not run until mathematical validation succeeds.

### Frontend placement and behavior

- Put the feature in `src/features/cielo/` and export its public components and
  types through that feature's `index.ts`.
- Put API query and mutation hooks in `src/hooks/`, following the existing
  authenticated TanStack Query patterns.
- Add the authenticated route
  `/business-list/$id/credenciamento-cielo` for the four-step onboarding form.
  The route is available to every accessible business type; do not apply the
  existing non-store guard.
- Replace the current unavailable placeholder in the Cielo tab on the business
  details page.
- When the business has no Cielo seller, show a `Credenciar` action that opens
  the onboarding route.
- When a seller exists, show its `status`, `merchant_id` when present, and
  `last_submitted_at` when present.
- Show a retry action only when `can_retry` is true. When a `FAILED` seller is
  cooling down, show when retry becomes available and keep the action disabled.
- Retry does not open the form. It calls the empty-body retry endpoint and then
  refreshes the Cielo seller query.
- A Quick-side create error keeps the user on the review step and displays the
  API error there. Any create response containing a persisted seller redirects
  to `/business-list/$id?tab=cielo`. Make the business-details route recognize
  this search parameter and select the Cielo tab.
- A Quick-side retry error or `429` remains on business details and displays an
  error there. A completed retry refreshes the saved status in place.

## Submission result UX

| Result | Backend expectation | Frontend expectation |
| --- | --- | --- |
| Quick validation, configuration, credentials, or backend failure | Do not create a Cielo seller record. | Remain on the review step and display an error message. |
| Cielo `4xx`/`5xx`, service outage, timeout, connection failure, or missing response | Create the Cielo seller with `FAILED`. | Redirect to the underlying business details page. |
| Malformed Cielo `2xx` | Create the Cielo seller with `INTERVENTION_REQUIRED`. | Redirect to the underlying business details page. |
| Valid Cielo `2xx` | Create the Cielo seller with `PENDING`. | Redirect to the underlying business details page. |

## Implementation sequence

1. Create the `cielo` Django app, model, generated migration, settings, URL
   inclusion, admin registration, and environment wiring.
2. Add backend CPF/CNPJ validators, BrasilAPI validation integration, OAuth
   token caching, Cielo payload construction, failure classification, and
   submission service.
3. Add serializers, detail/create/retry views, option views, access checks, and
   atomic create/retry locking.
4. Add frontend validators, types, authenticated hooks, the four-step form,
   route, business-details Cielo tab, status display, and cooldown-aware retry.
5. Add only the automated tests enumerated below.
6. Run the relevant verification commands without changing the exclusive test
   scope:

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

This is the complete and exclusive automated test plan for the feature. Do not
create tests outside the cases listed below.

### Submission business rules

Create backend and frontend tests for every row in the submission result table:

- Quick validation, configuration, credentials, or backend failure creates no
  record; the frontend remains on the review step and displays the error.
- Cielo `4xx`/`5xx`, service outage, timeout, connection failure, or missing
  response creates a `FAILED` record; the frontend redirects to business
  details.
- A malformed Cielo `2xx` response creates an `INTERVENTION_REQUIRED` record;
  the frontend redirects to business details.
- A valid Cielo `2xx` response creates a `PENDING` record; the frontend
  redirects to business details.

### Document validation

- Backend unit tests for mathematical CPF validation.
- Backend unit tests for mathematical numeric and alphanumeric CNPJ validation.
- Frontend unit tests for mathematical CPF validation.
- Frontend unit tests for mathematical numeric and alphanumeric CNPJ validation.
- Backend integration tests proving that a mathematically invalid CNPJ does not
  call BrasilAPI.
- Frontend integration tests proving that a mathematically invalid CNPJ does
  not call BrasilAPI.

Use the same canonical fixtures on both sides, including valid CPF
`52998224725`, valid numeric CNPJ `11222333000181`, and valid alphanumeric CNPJ
`12BC34501DE35`, plus variants with an altered check digit.

### Retry cooldown

- Backend integration tests for the Cielo retry cooldown.
- Verify that `FAILED` is required for retry.
- Verify that a retry within `CIELO_RETRY_COOLDOWN_SECONDS` is rejected without
  calling Cielo.
- Verify that retry is allowed when the cooldown has elapsed or
  `last_submitted_at` is null.
- Verify that cooldown enforcement is atomic for concurrent retry requests.
- Verify the documented `last_submitted_at` rules for HTTP responses,
  pre-transmission failures, and post-transmission read timeouts or connection
  resets.
