# Cielo Plans

The high-level goal is to create the Cielo Plans feature end-to-end.

A Cielo plan defines a fixed fee and an MDR (Merchant Discount Rate) for each
combination of card brand, payment method, and number of installments. Plans are
used only inside Quick and are not sent to Cielo: the onboarding payload still
omits `Agreements`. A future transaction feature will receive Cielo transactions
through a webhook and split each transaction's value using the fixed fees and
MDRs of the seller's plan
([Split autorizado](https://docs.cielo.com.br/split/reference/split-autorizado)).

Plans are immutable. They are never edited or deleted: a user changes pricing by
copying a plan into a new one, and retires a plan by archiving it. A seller's
pricing therefore never changes after signup.

## The flow

1. With a reseller or re-reseller selected in the drawer, a user creates a
   Cielo plan owned by that business, from scratch or as a copy of one of its
   plans.
2. A user creates a new business.
3. With a superior business selected in the drawer, a user signs up that
   business with Cielo. A store never signs itself up.
4. During the signup, the user picks one of the selected business's active
   plans for the Cielo seller.

## Scope

Out of scope:

- Sending plans to Cielo.
- Anticipation fees.
- Editing or deleting plans; they are copied and archived instead.
- Changing a seller's plan after signup; there is no seller edit feature yet.
  Until then, a seller's pricing is fixed.
- Showing a seller's plan after signup, for example on the business details
  page.
- Recording which plan a copy was made from.
- Archiving the original plan as part of copying it; it is a separate step.
- Restricting which businesses the selected business can sign up. A later
  change will show only the businesses directly under the selected business,
  which also limits who can be signed up.
- Signing up root resellers. A future "admin" business will do this.
- Helpers for filling many rates at once.
- Responsive layouts for phones.

## Backend

Cielo-specific code lives in the `cielo` Django app, and its models and URLs
are prefixed with `cielo`.

### Models

`CieloPlan`:

| Field            | Notes                                                                |
| ---------------- | -------------------------------------------------------------------- |
| `owner_business` | FK to `quickportal.Business`, `PROTECT`. Never a store.              |
| `name`           | Required. Unique per `owner_business`, including archived plans.     |
| `description`    | Optional.                                                            |
| `created_by`     | FK to the user who created the plan.                                 |
| `created_at`     | Set on creation.                                                     |
| `archived_at`    | Null while the plan is active; set when it is archived.              |
| `archived_by`    | FK to the user who archived the plan; null while the plan is active. |

`CieloPlanRate`, one row per brand, method, and installment count:

| Field          | Notes                                                                 |
| -------------- | --------------------------------------------------------------------- |
| `plan`         | FK to `CieloPlan`, `CASCADE`.                                         |
| `card_brand`   | Required `TextChoices`: Visa, Elo, MasterCard.                        |
| `method`       | Required `TextChoices`: Credit, Debit.                                |
| `installments` | Null for debit; 1 to 12 for credit.                                   |
| `mdr`          | Percentage, `DecimalField(max_digits=5, decimal_places=2)`, 0 to 100. |
| `fixed_fee`    | Amount in R$, `DecimalField` with 2 decimal places, zero or greater.  |

`CieloBusiness` gets a required, non-null `plan` FK to `CieloPlan` with
`PROTECT`. Current data is disposable: reset local databases instead of writing
a default or a data migration, and give every seller in tests and seed data a
plan.

### Rules

- A store cannot own a plan. Enforce it in `CieloPlan.clean()`.
- Plan names are unique per owner business across active and archived plans,
  and case-sensitive: `UniqueConstraint(fields=["owner_business", "name"])`. An
  archived plan keeps its name reserved, so archiving and unarchiving never
  conflict with another plan's name.
- Each rate is unique on `(plan, card_brand, method, installments)`. Use
  `UniqueConstraint(..., nulls_distinct=False)` so a plan cannot have two debit
  rows for the same brand.
- A debit rate has no installments; a credit rate has 1 to 12.
- Every rate is required: a plan has one debit rate and twelve credit rates for
  each of the three brands, 39 rates in total.
- Every plan field and rate value is required, except `description`.
- A plan's name, description, and rates cannot change after creation.
- Archiving sets `archived_at` and `archived_by`; unarchiving clears both.
  Archiving an archived plan or unarchiving an active one is rejected.
- Sellers keep an archived plan. An archived plan cannot be assigned to a new
  seller.

### Access

Plans are business-scoped. The scope is the business selected in the drawer,
sent as a required `business` query parameter on every plan request and on the
seller create request.

- A business can only see, copy, archive, unarchive, and assign the plans it
  owns. Plans owned by any other business, including superior and subordinate
  businesses, are invisible to it: requests for them return `404`.
- Any user with access to the selected business can create, archive, and
  unarchive its plans, whatever their role, including viewers.
- When a seller is created, the backend validates that the chosen plan is owned
  by the selected business and is active. Do not rely on the frontend offering
  only valid plans.

### API

| Method | Path                                         | Description                                                                                                                       |
| ------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/cielo/plans/?business=<id>`                | Active plans owned by the business, newest first. Used by `/planos-cielo` and the signup form.                                    |
| `GET`  | `/cielo/plans/?business=<id>&archived=true`  | Archived plans owned by the business, most recently archived first.                                                               |
| `POST` | `/cielo/plans/?business=<id>`                | Create a plan with all its rates, owned by the business. Rejects stores. Copies use this endpoint too.                            |
| `GET`  | `/cielo/plans/<id>/?business=<id>`           | Retrieve a plan owned by the business, active or archived, with its rates.                                                        |
| `POST` | `/cielo/plans/<id>/archive/?business=<id>`   | Archive an active plan.                                                                                                           |
| `POST` | `/cielo/plans/<id>/unarchive/?business=<id>` | Unarchive an archived plan.                                                                                                       |

There are no update or delete endpoints.

The Cielo seller create request gets a required `plan` field and the selected
business as its `business` query parameter. Retrying a failed seller reuses its
saved plan, even if the plan has been archived since.

Validation errors keep the Django REST Framework shape
`{ "<field>": ["<message>"] }`.

## Frontend

Add a "Planos Cielo" link to the business-level drawer, separate from the
existing "Planos e Taxas". It is not shown for store businesses.

### `/planos-cielo`

Lists the plans owned by the business selected in the drawer, in two tables.
Each row shows the plan name with its description in smaller text below, and
links to `/planos-cielo/:id`.

- Active plans, ordered by creation date, newest first.
- Archived plans, in a second table that is collapsed by default, ordered by
  archive date, most recent first.

### `/planos-cielo/:id`

A read-only page showing the plan and all its rates, for active and archived
plans. A plan not owned by the selected business is not found.

Actions:

- "Copiar": opens `/planos-cielo/novo?copiar=<id>`. Available for active and
  archived plans.
- "Arquivar" for an active plan, or "Desarquivar" for an archived plan. On
  success, stay on the page and show the new state.

### `/planos-cielo/novo`

The form for creating a plan. With `?copiar=<id>`, it is prefilled from that
plan: the description and all 39 rates are copied, and the name starts empty
because it must differ from every plan of the business, archived ones included.
A copy is a new, independent plan.

Fields:

- Name
- Description

Then a rates section with one accordion per card brand. Only one accordion can
be expanded at a time. Each accordion holds a table with four columns: method,
installments, MDR, and fixed fee.

- Method and installments are read-only text.
- MDR and fixed fee are decimal inputs. MDR has a `%` suffix and the fixed fee
  has an `R$` prefix (MUI `InputAdornment`). Use the pt-BR comma decimal
  separator, and keep values as strings in the Zod schema to avoid float
  rounding.

Every table has the same rows:

- One debit row, with empty installments.
- Twelve credit rows, from 1x to 12x.

After the brand name, each accordion shows a chip with one of three states:

- Incomplete: before the accordion's fields are validated.
- Complete: the accordion's fields were validated and have no errors.
- Error: the accordion's fields were validated and at least one has an error.

At the bottom right of each table, a "Concluir" button validates that
accordion's fields with React Hook Form's `trigger` and collapses it. Values are
written to the form state as they are typed; "Concluir" does not save them.

Submitting the form validates every field. If any accordion has errors, expand
the first one with errors. After a successful submit, redirect to
`/planos-cielo`. If the request fails, stay on the form and show the error,
mapping backend field errors to their inputs where possible.

### Cielo signup

The signup form's first step, "Identificação", gets a required plan picker. It
lists the active plans owned by the business selected in the drawer.

A Cielo signup cannot start while the selected business has no active plans,
even if it has archived ones:

- On the business details page, the Cielo panel's "Credenciar" button is
  disabled and a message explains that a plan must be created first, with a link
  to `/planos-cielo/novo`.
- Opening `/business-list/:id/credenciamento-cielo` directly shows the same
  message instead of the form.

The backend still rejects a seller create request without a plan or with an
archived plan.

## Documentation

Start a minimal `quick-docs/cielo/plans.md` page covering the models, rules,
access, and API, and add it to the Cielo section of the docs navigation.

## Tests

Backend:

- A plan cannot be owned by a store.
- A second plan with the same name for the same business is rejected, even when
  the existing plan is archived; the same name under another business is
  accepted.
- A plan must contain all 39 rates; a missing, duplicated, or out-of-range rate
  is rejected, including a debit rate with installments and a credit rate above
  12x.
- The plan list for a business returns only its own plans, not those of its
  superior or subordinate businesses, and separates active from archived plans.
- A plan owned by another business returns `404` on retrieve, archive, and
  unarchive, even when the user can access that business.
- A viewer can create, archive, and unarchive the selected business's plans.
- There are no update or delete endpoints for plans.
- Archiving keeps the plan on its sellers, and unarchiving restores it to the
  active list and the signup picker.
- Creating a seller without a plan, with an archived plan, or with a plan not
  owned by the selected business is rejected.
- Retrying a failed seller whose plan was archived still succeeds.

Frontend:

- The "Planos Cielo" link is hidden for stores.
- The list shows only the selected business's plans: active plans newest first,
  and archived plans in a collapsed second table ordered by archive date, each
  linking to its detail page.
- The detail page is read-only, offers "Copiar", and switches between
  "Arquivar" and "Desarquivar".
- Copying prefills the form with the description and all rates, and leaves the
  name empty.
- An accordion's chip moves from incomplete to complete or error after
  "Concluir", and only one accordion is expanded at a time.
- A failed submit stays on the form; a successful submit redirects to
  `/planos-cielo`.
- The signup form requires a plan in the first step and lists only active
  plans.
- With no active plans, the "Credenciar" button is disabled and the signup
  route shows the create-a-plan message instead of the form.
