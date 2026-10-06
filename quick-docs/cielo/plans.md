# Plans

A Cielo plan defines a fixed fee and an MDR (Merchant Discount Rate) for each
card brand, payment method, and number of installments. Every Cielo seller has
a plan, chosen during signup.

Plans are used only inside Quick Portal. They are not sent to Cielo: the
onboarding payload still omits `Agreements`. A future transaction feature will
split each Cielo transaction using the seller's plan
([Split autorizado](https://docs.cielo.com.br/split/reference/split-autorizado)).

Plans are immutable. They are never edited or deleted: pricing changes by
copying a plan into a new one, and a plan is retired by archiving it. A
seller's pricing therefore never changes after signup.

## Models

`CieloPlan` (table `cielo_plans`):

| Field            | Notes                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| `owner_business` | FK to `Business`, `PROTECT`. Never a store.                           |
| `name`           | Required, maximum 200 characters. Unique per `owner_business`.        |
| `description`    | Optional.                                                             |
| `created_by`     | FK to the user who created the plan.                                  |
| `created_at`     | Set on creation.                                                      |
| `archived_at`    | Null while the plan is active; set when it is archived.               |
| `archived_by`    | FK to the user who archived the plan; null while the plan is active.  |

`CieloPlanRate` (table `cielo_plan_rates`), one row per brand, method, and
installment count:

| Field          | Notes                                                       |
| -------------- | ----------------------------------------------------------- |
| `plan`         | FK to `CieloPlan`, `CASCADE`.                               |
| `card_brand`   | `Visa`, `Elo`, or `Master` (Cielo's Mastercard value).      |
| `method`       | `Debit` or `Credit`.                                        |
| `installments` | Null for debit; 1 to 12 for credit.                         |
| `mdr`          | Percentage from 0 to 100, two decimal places.               |
| `fixed_fee`    | Amount in R$, zero or greater, two decimal places.          |

`CieloBusiness.plan` is a required FK to `CieloPlan` with `PROTECT`.

## Rules

- A store cannot own a plan.
- Plan names are unique per owner business, archived plans included, and
  case-sensitive. An archived plan keeps its name reserved.
- A plan has exactly 39 rates: for each brand, one debit rate and twelve credit
  rates, from 1x to 12x. Each rate is unique on
  `(plan, card_brand, method, installments)`, with nulls treated as equal so a
  brand cannot have two debit rates.
- Every plan field and rate value is required, except `description`.
- A plan's name, description, and rates cannot change after creation.
- Archiving sets `archived_at` and `archived_by`; unarchiving clears both.
  Archiving an archived plan or unarchiving an active one returns `409`.
- Sellers keep an archived plan, and retrying a failed seller reuses it. An
  archived plan cannot be assigned to a new seller.

## Access

Plans are scoped to the business selected in the drawer, sent as the required
`business` query parameter on every plan request and on the seller create
request. A missing parameter returns `400`; a business the user cannot access
returns `404`.

- A business sees, copies, archives, unarchives, and assigns only the plans it
  owns. Plans of any other business, superior and subordinate businesses
  included, return `404`.
- Any user with access to the selected business can create, archive, and
  unarchive its plans, whatever their role.

## API

All endpoints require JWT authentication.

| Method | Path                                         | Result                                                                    |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------- |
| `GET`  | `/cielo/plans/?business=<id>`                | Active plans of the business, newest first. No rates.                     |
| `GET`  | `/cielo/plans/?business=<id>&archived=true`  | Archived plans of the business, most recently archived first. No rates.   |
| `POST` | `/cielo/plans/?business=<id>`                | Create a plan with all its rates. Stores get `400`. Copies use this too.  |
| `GET`  | `/cielo/plans/<id>/?business=<id>`           | A plan of the business, active or archived, with its rates.               |
| `POST` | `/cielo/plans/<id>/archive/?business=<id>`   | Archive an active plan. Returns the plan.                                 |
| `POST` | `/cielo/plans/<id>/unarchive/?business=<id>` | Unarchive an archived plan. Returns the plan.                             |

There are no update or delete endpoints.

### Create request

```json
{
  "name": "Básico",
  "description": "Plano padrão",
  "rates": [
    {
      "card_brand": "Visa",
      "method": "Debit",
      "installments": null,
      "mdr": "1.50",
      "fixed_fee": "0.10"
    },
    {
      "card_brand": "Visa",
      "method": "Credit",
      "installments": 1,
      "mdr": "2.99",
      "fixed_fee": "0.10"
    }
  ]
}
```

The example shows two of the 39 required rates. Decimals are sent and returned
as strings. Validation errors keep the DRF shape: `{"name": ["..."]}` for a
duplicate name, `{"rates": ["..."]}` for a missing or duplicated rate, and
`{"rates": [{}, {"mdr": ["..."]}, ...]}` for invalid values, in request order.

### Seller create request

`POST /cielo/businesses/<business_id>/?business=<selected_business_id>`
requires a `plan` field with the ID of an active plan owned by the selected
business. A missing plan, an archived plan, or a plan of another business
returns `400` with a `plan` error. Which businesses the selected business can
sign up is not restricted yet.

## Frontend

- "Planos Cielo" in the business drawer, hidden for stores, opens
  `/planos-cielo`: active plans, and archived plans in a collapsed table.
- `/planos-cielo/:id` shows a plan read-only, with "Copiar" and "Arquivar" or
  "Desarquivar".
- `/planos-cielo/novo` creates a plan. With `?copiar=<id>`, it starts from that
  plan's description and rates, with an empty name.
- The Cielo signup's "Identificação" step requires one of the selected
  business's active plans. Without active plans, "Credenciar" is disabled and
  the signup route asks for a plan to be created first.
