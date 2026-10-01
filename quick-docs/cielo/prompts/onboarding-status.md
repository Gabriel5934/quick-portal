# Cielo onboarding status

The high-level goal is to receive Cielo's asynchronous onboarding notifications,
keep a record of every notification, and show the user a granular view of each
seller's onboarding progress. Read `quick-docs/cielo/onboarding-status.md` for
the notification payloads and `quick-docs/cielo/seller-onboarding.md` for the
existing seller submission flow before implementing it.

## Goals

- Listen to onboarding notifications from Cielo.
- Keep an immutable record of every notification received.
- Update the matching `CieloBusiness` statuses from each notification.
- Show the user the KYC, bank-account validation, and overall onboarding
  statuses alongside the Quick submission status.

## Out of scope

- Registering the notification URL with Cielo.
- Any seller-facing action for `AwaitingMerchantAction` beyond displaying the
  status.
- Storing bank-account data from notifications.
- Changing the submission status or retry rules from notifications: only
  `FAILED` sellers remain retryable.

## Submission status rename

- Replace `CieloSubmissionStatus.PENDING` with `SENT`, labelled `Enviado`. It
  represents a seller that Cielo accepted with a valid `MerchantId`; the final
  onboarding outcome is tracked by the new notification statuses.
- Do not keep a `PENDING` value and do not write a data migration. There is no
  production data; existing development rows may be left with the old value.
- Generate the migration with `makemigrations`; never hand-write or edit it.
- Update every backend and frontend reference to `PENDING`, including tests,
  and update `quick-docs/cielo/seller-onboarding.md`, which currently states
  that notifications are out of scope and that accepted sellers stay `PENDING`.

## Notification status choices

Represent each notification status with Django `IntegerChoices`. Values are
Cielo's status numbers and labels are human-readable pt-BR text.

| Choices class            | Value | Label                      |
| ------------------------ | ----- | -------------------------- |
| `CieloChangeType`        | 20    | KYC                        |
|                          | 21    | Conta bancária             |
|                          | 23    | Credenciamento             |
| `CieloKycStatus`         | 1     | Em análise                 |
|                          | 2     | Aprovado                   |
|                          | 3     | Aprovado com restrição     |
|                          | 4     | Rejeitado                  |
| `CieloBankAccountStatus` | 0     | Erro interno               |
|                          | 1     | Criado                     |
|                          | 2     | Em processamento           |
|                          | 3     | Sucesso                    |
|                          | 4     | Erro                       |
| `CieloOnboardingStatus`  | 1     | Em análise                 |
|                          | 2     | Aprovado                   |
|                          | 3     | Aguardando ação do lojista |
|                          | 4     | Desconhecido               |
|                          | 5     | Banido                     |

Cielo may send a status value that is not listed. Store it unchanged; the field
choices are not enforced on save. The API labels an unlisted value as
`Desconhecido (<value>)`.

## Data model

### `CieloBusiness` changes

Add three nullable status fields, each with its own update timestamp:

| Model field                      | Requirement                                              |
| -------------------------------- | -------------------------------------------------------- |
| `kyc_status`                     | Nullable positive small integer, `CieloKycStatus`.       |
| `kyc_status_updated_at`          | Nullable timezone-aware datetime.                        |
| `bank_account_status`            | Nullable positive small integer, `CieloBankAccountStatus`. |
| `bank_account_status_updated_at` | Nullable timezone-aware datetime.                        |
| `onboarding_status`              | Nullable positive small integer, `CieloOnboardingStatus`. |
| `onboarding_status_updated_at`   | Nullable timezone-aware datetime.                        |

Make `merchant_id` unique and indexed so notifications can look sellers up by
it. Keep it nullable; a seller without a Cielo merchant ID stores `NULL`, never
an empty string, so the unique constraint does not collide.

### `CieloNotification` model

Create an immutable event model with database table `cielo_notifications`:

| Model field           | Requirement                                                                            |
| --------------------- | -------------------------------------------------------------------------------------- |
| `cielo_business`      | Nullable foreign key to `CieloBusiness` (`on_delete=PROTECT`), reverse name `notifications`. |
| `change_type`         | Required positive small integer, `CieloChangeType`.                                    |
| `merchant_id`         | Required, maximum 36 characters. The seller's merchant ID as sent by Cielo.            |
| `kyc_status`          | Nullable, `CieloKycStatus`.                                                            |
| `bank_account_status` | Nullable, `CieloBankAccountStatus`.                                                    |
| `onboarding_status`   | Nullable, `CieloOnboardingStatus`.                                                     |
| `received_at`         | Automatically set at creation.                                                         |

- `merchant_id` comes from `Data.SubordinateMerchantId` for change types 20
  and 23, and from `Data.MerchantId` for change type 21.
- A KYC notification fills only `kyc_status`; a bank-account notification fills
  only `bank_account_status`; an onboarding notification fills whichever it
  provides of `OnboardingStatus`, `KycAnalysisInfo.Status`, and
  `BankAccountValidation.Status`; an omitted or `null` status is stored as
  `null`.
- Do not store the raw payload or any bank-account data (account, agency,
  document, or bank code).
- Enforce immutability: updating an existing row or deleting a row raises an
  error, and the admin registration is read-only with no add, change, or
  delete permission.

## Notification endpoint

Add `POST /cielo/notifications/`.

### Authentication

- Cielo returns every custom header configured when the notification URL was
  registered. Authenticate with the dedicated header
  `X-Cielo-Webhook-Token: <token>`. Do not use `Authorization`, because the
  default SimpleJWT authentication would try to decode it.
- Set `authentication_classes = []` and `permission_classes = [AllowAny]` on
  the view.
- Read the expected token from `CIELO_WEBHOOK_TOKEN`. Add it to Django settings,
  `.env.example`, and both backend Compose files with no application default,
  like the other Cielo variables. A missing or blank value is a Quick
  configuration error: log it and return `500` without processing.
- Compare tokens with `hmac.compare_digest`. A missing or invalid token returns
  `401` and stores nothing.
- Reject a payload whose `MasterMerchantId` differs from `CIELO_MERCHANT_ID`
  with `403` and store nothing.
- Never log the token.

### Processing

1. Authenticate and check `MasterMerchantId` as above.
2. Validate the payload shape. A malformed payload (not an object, missing
   `ChangeType`, `Data`, merchant ID, or a non-integer status) returns `400`,
   is logged, and stores nothing.
3. Inside one transaction, look up the `CieloBusiness` by `merchant_id` with
   `select_for_update`.
4. Create the `CieloNotification`, linked to the seller when one was found.
5. When a seller was found, update its statuses using the notification's
   `received_at` as the update timestamp:
   - KYC (20): `kyc_status` and `kyc_status_updated_at`.
   - Bank account (21): `bank_account_status` and
     `bank_account_status_updated_at`.
   - Onboarding (23): only the statuses it provides, each with its
     timestamp. An omitted or `null` status leaves the seller's value and
     timestamp unchanged (see "Partial onboarding notifications" in
     `quick-docs/cielo/onboarding-status.md`).
6. Return `200` with an empty JSON object.

Notifications never change the submission status, and the retry flow is
unchanged: only `FAILED` is retryable.

Notification ordering needs no special handling: Cielo sends an onboarding
notification only after a KYC or bank-account notification. Duplicate
deliveries (Cielo retries twice when it does not receive `200`) create
duplicate events and leave the seller in the same final state.

A notification for an unknown merchant ID, including a bank-account
notification for the master merchant, is stored without a seller, logged, and
answered with `200` so Cielo stops retrying. An unknown `ChangeType` is
handled the same way, with all statuses null.

## Seller summary response

Extend the existing summary shared by detail, create, and retry:

```json
{
  "id": 1,
  "business": 42,
  "status": "SENT",
  "merchant_id": "f88cc14d-c796-4939-957e-de4dddcb2257",
  "last_submitted_at": "2026-09-24T15:00:00Z",
  "retry_available_at": null,
  "can_retry": false,
  "kyc_status": { "value": 2, "label": "Aprovado" },
  "kyc_status_updated_at": "2026-09-25T10:00:00Z",
  "bank_account_status": { "value": 2, "label": "Em processamento" },
  "bank_account_status_updated_at": "2026-09-25T09:00:00Z",
  "onboarding_status": null,
  "onboarding_status_updated_at": null
}
```

Each notification status is `null` until its first notification arrives. Do
not expose the notification history through the API.

## Mock Cielo API

Extend `local-mock-cielo/` so it sends notifications the way Cielo does. This
code never reaches production: do not add tests or payload validation for the
new behavior.

- Configure the destination through environment variables instead of a
  registration request:
  - `MOCK_CIELO_NOTIFICATION_URL`, for example
    `http://web:8000/cielo/notifications/`. When unset, notifications are
    disabled.
  - `MOCK_CIELO_NOTIFICATION_TOKEN`, sent as `X-Cielo-Webhook-Token`. It must
    match the backend's `CIELO_WEBHOOK_TOKEN`.
  - `MOCK_CIELO_NOTIFICATION_DELAY_SECONDS`, the delay between notifications,
    defaulting to a few seconds.
  - `MOCK_CIELO_NOTIFICATION_SCENARIO`, selecting the statuses sent:

    | Scenario         | KYC           | Bank account | Onboarding             |
    | ---------------- | ------------- | ------------ | ---------------------- |
    | `approved`       | Approved      | Success      | Approved               |
    | `kyc_rejected`   | Rejected      | Success      | Banned                 |
    | `bank_error`     | Approved      | Error        | AwaitingMerchantAction |
    | `under_analysis` | UnderAnalysis | Processing   | UnderAnalysis          |
- After a successful seller creation, schedule a KYC notification followed by
  an onboarding notification, then a bank-account notification followed by an
  onboarding notification, each separated by the configured delay. Every
  onboarding notification carries the current KYC and bank-account statuses.
- Send each notification as JSON with `MasterMerchantId` set to the mock
  merchant ID. When the response is not `200`, retry twice more.
- Log every delivery attempt with the existing structured logger, without
  logging the token. Scheduled notifications are in-memory; losing them on
  restart is acceptable.
- Wire the variables into `local-mock-cielo/docker-compose.dev.yml` and
  document them in `local-mock-cielo/README.md`.
- The backend must accept the mock's `Host` header in development: add the
  Docker-network host name the mock posts to (`web`) to the development
  `ALLOWED_HOSTS` default.
- The mock is temporarily included in the root `docker-compose.yml`, and the
  development backend points `CIELO_AUTH_BASE_URL` and
  `CIELO_ONBOARDING_BASE_URL` at `http://mock-cielo:3000`. Never commit the
  root `docker-compose.yml` change or those environment values.
  `local-mock-cielo/` is ignored by Git, so its changes stay local.

## Frontend

Follow the rough sketch in Figma (QuickPortal file, node `78-23`).

- Update the Cielo types and hooks for `SENT` and the new summary fields.
- Extract a shared `StatusCard` component into
  `src/components/status-card/`, exported through that folder's `index.ts`.
  It renders the outlined `Paper` shell used by the current OWN card: a left
  side with a `title` and an optional `subtitle`, and a right side with any
  children, stacked vertically on `xs` and in a row from `sm`. It holds no OWN
  or Cielo logic.
- Export a shared `StatusBadge` from the same folder: a circled icon above a
  small `caption` and a larger `label`, with a `tone` prop (`success`,
  `warning`, `pending`, `action`, `error`, `neutral`) that selects the icon and
  theme color from the tone table below. Each badge exposes `role="status"`
  with an accessible name combining caption and label.
- Rewrite `OwnStatusCard` on top of `StatusCard` and `StatusBadge`, replacing
  the colored dot with one badge captioned `Credenciamento`. Keep the
  `Revisar` action for `API_REQUEST_FAILED`, placed before the badge like the
  Cielo retry action.

  | OWN `registration_status` | Label                  | Tone    |
  | ------------------------- | ---------------------- | ------- |
  | `REGISTERED`              | Credenciado            | Success |
  | `PENDING`                 | Pendente               | Pending |
  | `UNKNOWN`                 | Verificação necessária | Action  |
  | `API_REQUEST_FAILED`      | Erro no cadastro       | Error   |
  | No OWN business           | Não credenciado        | Neutral |
- Add a Cielo status card built on `StatusCard` to the business details page,
  directly below the OWN card and above the tabs.
  - When the business has no Cielo seller, the card shows only the title and a
    single neutral `Credenciamento` / `Não credenciado` badge, like the OWN
    card. The `Credenciar` action stays in the Cielo tab.
  - Left side: the title `Cielo` and, as the `subtitle`, a small
    `Última atualização: <date and time>` text showing the most recent of
    `last_submitted_at` and the three `*_status_updated_at` values. Hide it
    when all are null.
  - Right side, in order:
    1. The retry action, shown only for `FAILED`. During the cooldown it is
       disabled and a tooltip shows when retry becomes available
       (`retry_available_at`). Wrap the disabled button so the tooltip still
       receives hover and focus. Retry errors display in the card.
    2. Badge with caption `Quick`: the submission status (`Enviado`,
       `Falhou`, `Intervenção necessária`).
    3. A vertical divider.
    4. Badge with caption `Credenciamento`: the onboarding status.
    5. Badge with caption `Bancário`: the bank-account status.
    6. Badge with caption `KYC`: the KYC status.
  - Each badge is a circled icon above a small caption and a larger status
    label. A notification status that has not arrived yet shows `Aguardando`.
- Pick each badge's icon and color from the status `value`, never the label:

  | Tone    | Icon            | Values                                                                                                                           |
  | ------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
  | Success | Circled check   | Quick `SENT`; KYC Approved; bank Success; onboarding Approved                                                                    |
  | Warning | Circled check   | KYC ApprovedWithRestriction                                                                                                      |
  | Pending | Hourglass       | Not received yet; KYC UnderAnalysis; bank Created, Processing; onboarding UnderAnalysis                                          |
  | Action  | Circled warning | Quick `INTERVENTION_REQUIRED`; onboarding AwaitingMerchantAction                                                                 |
  | Error   | Circled X       | Quick `FAILED`; KYC Rejected; bank InternalError, Error; onboarding Banned                                                       |
  | Neutral | Circled ?       | Onboarding Unknown; any unlisted value                                                                                           |

- The Cielo tab keeps the `Credenciar` action when no seller exists. When a
  seller exists, it shows a details table in the same style as the OWN tab
  with `Merchant ID` and `Último envio` (`last_submitted_at`). Status and
  retry move to the card and are not repeated in the tab.
- Use Material UI theme palette colors and make the badge row wrap on `xs`.

## Documentation

- Update `quick-docs/cielo/onboarding-status.md` with the endpoint,
  authentication header, stored fields, and status labels.
- Update `quick-docs/cielo/seller-onboarding.md` for the `SENT` rename and
  remove the statement that notifications are out of scope.

## Implementation sequence

1. Rename `PENDING` to `SENT`; add the notification choices, `CieloBusiness`
   fields, unique `merchant_id`, and `CieloNotification`; generate migrations.
2. Add `CIELO_WEBHOOK_TOKEN` and the development `ALLOWED_HOSTS` change to
   settings, `.env.example`, and both backend Compose files.
3. Add the notification view, URL, processing service, read-only admin, and
   summary serializer changes.
4. Update the frontend types and hooks, extract `StatusCard` and
   `StatusBadge` and move the OWN card onto them, add the Cielo status card, rework the Cielo tab, and update
   existing tests.
5. Extend the mock Cielo API.
6. Update the documentation.
7. Add only the automated tests listed below.
8. Run verification:

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

This is the complete and exclusive list of new automated tests. Existing tests
that reference `PENDING` are updated, not extended.

Backend integration tests for `POST /cielo/notifications/`:

- A missing or invalid token returns `401` and stores nothing; a valid token is
  accepted.
- A mismatched `MasterMerchantId` returns `403` and stores nothing.
- Each change type updates only its own status and timestamp.
- An onboarding notification updates all three statuses and all three
  timestamps.
- A notification for an unknown merchant ID is stored without a seller and
  returns `200`.
- Delivering the same notification twice stores two events and leaves the
  seller in the same state.
- An unlisted status value is stored unchanged.

Frontend tests for the business details page:

- With no seller, the Cielo card shows only the neutral `Não credenciado`
  badge, and the Cielo tab shows `Credenciar`.
- The OWN card renders one `Credenciamento` badge with the label and tone from
  the OWN mapping table for each `registration_status` and for no OWN
  business, and shows `Revisar` only for `API_REQUEST_FAILED`.
- With a seller, the card renders below the OWN card, and the four badges show
  the correct captions and the labels returned by the API.
- A notification status that has not arrived yet shows `Aguardando` with the
  pending tone.
- Each tone (success, warning, pending, action, error, neutral) renders the
  expected icon and color, parameterized by status value over the tone table.
- An unlisted value shows the API's `Desconhecido (<n>)` label with the
  neutral tone.
- `Última atualização` shows the most recent of the four timestamps and is
  hidden when all are null.
- The retry action appears before the Quick badge only for `FAILED`. During
  the cooldown it is disabled and its tooltip shows `retry_available_at`.
  Update the existing cooldown tests instead of duplicating them.
- With a seller, the Cielo tab shows `Merchant ID` and `Último envio`.

Existing frontend tests that reference `PENDING` or the old Cielo tab layout
are updated to `SENT` and to the new layout. Existing OWN card tests keep their
intent but are updated to the new badge labels (sentence case instead of the
current uppercase text) and scope their queries to the OWN card, because the
page will contain several `role="status"` badges.
