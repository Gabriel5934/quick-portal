# Recurring Fees multi-step form

## Goal

Build a business-scoped Recurring Fees feature for reseller and re-reseller
profiles. A recurring fee is owned by the currently selected business and is
assigned to one or more direct child businesses. The creation flow is a wizard:
each step has its own TanStack Router route and its own React Hook Form instance,
while `little-state-machine` preserves validated values between routes.

The backend remains authoritative for permissions, hierarchy, schedule rules,
and the complete payload. The frontend must never send an editable `owner` or
`created_by`; both are derived by the API from the URL scope and authenticated
user.

## Product contract

A recurring fee has:

- `name` and optional `description`.
- `setup_value`, charged once for each target on that target's first successful
  recurring charge. Zero is valid.
- A pricing mode:
  - `FIXED`: one `fee_value`.
  - `GOAL`: `value_below_goal`, `goal_amount`, and
    `value_at_or_above_goal`. The goal metric must be agreed before
    implementation; the recommended v1 definition is the target's processed
    monetary volume during the recurrence period.
- A recurrence interval expressed as a positive `interval_count` plus a unit:
  `DAY`, `WEEK`, `MONTH`, or `YEAR`.
- A recurrence-dependent charge rule. The UI only shows valid controls for the
  selected recurrence unit.
- Inclusive `start_date`, optional inclusive `end_date`, and an `active` switch.
- An immutable `owner` business and one or more target businesses.
- Server-generated `created_at` and `created_by`.

`active` is the operator-controlled switch. A fee is currently effective only
when it is active and today's date is within its start/end window. Creating or
editing this configuration does not itself execute charges.

## Domain model

Use two backend models rather than a bare many-to-many relationship.

### `RecurringFee`

| Field                    | Suggested type and rule                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `id`                     | primary key                                                               |
| `owner`                  | `ForeignKey(Business, PROTECT, related_name="owned_recurring_fees")`      |
| `name`                   | `CharField(max_length=200)`                                               |
| `description`            | `TextField(blank=True)`                                                   |
| `setup_value`            | non-negative `DecimalField`, use the project's money precision convention |
| `pricing_mode`           | `FIXED` or `GOAL`                                                         |
| `fee_value`              | non-negative decimal; required only for `FIXED`                           |
| `goal_amount`            | non-negative decimal; required only for `GOAL`                            |
| `value_below_goal`       | non-negative decimal; required only for `GOAL`                            |
| `value_at_or_above_goal` | non-negative decimal; required only for `GOAL`                            |
| `recurrence_unit`        | `DAY`, `WEEK`, `MONTH`, or `YEAR`                                         |
| `recurrence_interval`    | positive integer, default `1`                                             |
| `charge_rule`            | enum described below                                                      |
| `charge_weekday`         | ISO weekday 1–7 when applicable                                           |
| `charge_day`             | calendar day 1–31 when applicable                                         |
| `charge_month`           | month 1–12 for yearly rules                                               |
| `business_day_ordinal`   | positive ordinal, such as `5` for fifth business day                      |
| `start_date`             | date                                                                      |
| `end_date`               | nullable date; must be on/after `start_date`                              |
| `active`                 | boolean, default `true`                                                   |
| `created_at`             | `DateTimeField(auto_now_add=True)`                                        |
| `created_by`             | `ForeignKey(settings.AUTH_USER_MODEL, PROTECT)`                           |

Suggested `charge_rule` values and valid combinations:

| Recurrence | Valid rule              | Required detail                         |
| ---------- | ----------------------- | --------------------------------------- |
| Daily      | `INTERVAL`              | none; anchor intervals on `start_date`  |
| Weekly     | `WEEKDAY`               | `charge_weekday`                        |
| Monthly    | `DAY_OF_MONTH`          | `charge_day`                            |
| Monthly    | `BUSINESS_DAY_OF_MONTH` | `business_day_ordinal`                  |
| Yearly     | `DATE_OF_YEAR`          | `charge_month` + `charge_day`           |
| Yearly     | `BUSINESS_DAY_OF_MONTH` | `charge_month` + `business_day_ordinal` |

Define a documented overflow rule. Recommended: a calendar day that does not
exist in a given month resolves to that month's final calendar day. “Business
day” also needs a calendar definition; v1 can mean Monday–Friday excluding no
holidays, but this must be explicit before charge execution is implemented.

### `RecurringFeeTarget`

| Field              | Suggested type and rule                                                 |
| ------------------ | ----------------------------------------------------------------------- |
| `recurring_fee`    | `ForeignKey(RecurringFee, CASCADE, related_name="target_links")`        |
| `target`           | `ForeignKey(Business, PROTECT, related_name="targeted_recurring_fees")` |
| `setup_charged_at` | nullable timestamp, reserved for charge execution                       |
| `next_charge_at`   | nullable timestamp/date, reserved for charge scheduling                 |

Add a unique constraint on `(recurring_fee, target)`. The through model is
necessary because setup-charge state belongs to each target independently.

Model `clean()` methods and database constraints should cover local field
consistency, but owner/target hierarchy and user access must also be validated
in the serializer/service because they depend on request context.

## Authorization and hierarchy rules

All endpoints require JWT authentication.

- The owner is taken from `/api/businesses/<owner_id>/recurring-fees/` and must
  equal the currently selected frontend business.
- Only `RESELLER` and `RE_RESELLER` businesses can own recurring fees. Stores
  receive `403` for the feature, even if a client bypasses the UI.
- List/read may follow the existing effective membership visibility rules.
- Create/update/activate/deactivate require the existing `ADMIN` or `MANAGER`
  effective role on the owner. Delete, if included, should require `ADMIN`.
- Every target must be a direct child (`target.parent_id == owner.id`). Do not
  rely only on `accessible_businesses()`, because that also includes
  grandchildren.
- Reject an empty target list, duplicates, inaccessible targets, owner-as-target,
  and targets outside the owner's direct children.
- Set `created_by = request.user` and `owner = URL owner`; ignore neither from a
  client payload—reject them if supplied to avoid a misleading contract.

Keep these checks in a recurring-fee domain service or serializer helpers so
create and update cannot drift apart.

## API contract

Recommended endpoints:

- `GET /api/businesses/<owner_id>/recurring-fees/`
- `POST /api/businesses/<owner_id>/recurring-fees/`
- `GET /api/businesses/<owner_id>/recurring-fees/<id>/`
- `PATCH /api/businesses/<owner_id>/recurring-fees/<id>/`
- `DELETE /api/businesses/<owner_id>/recurring-fees/<id>/` if hard deletion is
  a confirmed requirement; otherwise omit it and use `active=false`.
- `GET /api/businesses/<owner_id>/children/` or the existing businesses query
  with an explicit `direct_children=true` contract for the target picker.

Example create request:

```json
{
  "name": "Platform fee",
  "description": "Monthly platform access",
  "setup_value": "50.00",
  "pricing_mode": "GOAL",
  "fee_value": null,
  "goal_amount": "10000.00",
  "value_below_goal": "120.00",
  "value_at_or_above_goal": "80.00",
  "recurrence_unit": "MONTH",
  "recurrence_interval": 1,
  "charge_rule": "BUSINESS_DAY_OF_MONTH",
  "charge_weekday": null,
  "charge_day": null,
  "charge_month": null,
  "business_day_ordinal": 5,
  "start_date": "2026-09-01",
  "end_date": null,
  "active": true,
  "targets": [42, 43]
}
```

The response additionally includes `id`, nested lightweight owner/target
summaries, `created_at`, and a lightweight `created_by` representation. Decimal
money values remain JSON strings. Validation errors preserve the DRF field map
shape `{ "<field>": ["<message>"] }`.

Create/update the fee and all target links inside `transaction.atomic()`. For
updates, lock the fee row and replace/diff target links safely; never reset
`setup_charged_at` for retained targets.

## Wizard route structure

Use a route per step, nested under the authenticated business layout:

```text
/recurring-fees                         list
/recurring-fees/new/details             step 1
/recurring-fees/new/pricing             step 2
/recurring-fees/new/schedule            step 3
/recurring-fees/new/targets             step 4
/recurring-fees/new/review              step 5 and final POST
```

TanStack Router route files should remain thin wrappers. They render the shared
wizard shell and the current feature step. Add a reseller/re-reseller route
guard for UX, while treating API authorization as the real security boundary.
Do not edit `src/routeTree.gen.ts` manually.

## Shared state

Add `little-state-machine` to frontend dependencies. Initialize its store once
from a module imported by `src/main.tsx` before any wizard route renders.

```ts
export type RecurringFeeDraft = {
  name: string;
  description: string;
  setupValue: string;
  pricingMode: "FIXED" | "GOAL";
  feeValue: string;
  goalAmount: string;
  valueBelowGoal: string;
  valueAtOrAboveGoal: string;
  recurrenceUnit: "DAY" | "WEEK" | "MONTH" | "YEAR";
  recurrenceInterval: number;
  chargeRule: ChargeRule;
  chargeWeekday?: number;
  chargeDay?: number;
  chargeMonth?: number;
  businessDayOrdinal?: number;
  startDate: string;
  endDate: string;
  active: boolean;
  targetIds: number[];
};
```

Expose pure actions:

- `updateRecurringFeeDraft(state, partial)` merges only supplied draft fields.
- `resetRecurringFeeDraft()` returns a fresh initial state.

Do not persist this store to local storage. Importantly, clear incompatible
conditional fields when pricing mode, recurrence unit, or charge rule changes;
do this in the step submit mapping and validate again on the backend.

## Reusable multi-step UI

Create generic primitives outside the feature, for example under
`src/components/multi-step-form/`:

- `MultiStepFormShell`: responsive page grid, top progress bar, main content,
  right-side progress paper, and action area.
- `MultiStepProgress`: MUI `LinearProgress` at the top with accessible text such
  as “Step 2 of 5”.
- `MultiStepSidebar`: a `Paper` containing a vertical MUI `Stepper`; active,
  completed, and future states derive from route metadata.
- `FormFieldPaper`: one `Paper` per input or logical compound input, stacked
  vertically. It accepts label, description/help text, error state, and the
  control as children.
- `WizardActions`: consistent Cancel, Back, Continue, and Submit buttons.
- `useWizardStep`: small glue around `useStateMachine`, RHF `handleSubmit`, and
  typed TanStack navigation. Keep validation schemas feature-owned.

Layout behavior:

- `lg`/`xl`: content and the vertical-progress `Paper` use a two-column grid;
  the sidebar may be sticky beneath the page header.
- `xs`/`sm`/`md`: collapse to one column and place the step paper below the top
  progress bar (or behind an accessible summary), avoiding horizontal scroll.
- The top `LinearProgress` appears on every step and reflects completed
  transitions, not field focus.
- The input stack has one field paper per ordinary input. Closely coupled
  conditional values—such as goal threshold plus its two fee outcomes, or a
  charge rule plus its ordinal—may share one paper so their relationship is
  understandable and accessible.

The shell receives route/step metadata instead of importing Recurring Fees, so
future onboarding and plan funnels can reuse it.

## Step definitions

### 1. Details

Fields: name, description, setup value, active. Owner is displayed as read-only
context, not stored as an editable form value.

### 2. Pricing

Choose Fixed or Goal-based. Fixed shows one fee value. Goal-based shows the
goal amount and values for below versus equal/above. Zod uses a discriminated
union or `superRefine` to require only the active branch.

### 3. Schedule

Fields: recurrence interval/unit, dynamic charge rule/details, start date, and
optional end date. Changing the unit resets invalid charge fields. The schema
validates valid combinations and `endDate >= startDate`.

### 4. Targets

Load direct children of the selected owner. Provide a searchable multi-select
with select-all-visible support, selected count, loading/empty/error states, and
business name/type/document context. Require at least one target. If the owner
changes from the global business selector, reset the draft and return to the
first step so targets cannot leak across scopes.

### 5. Review

Show semantic summaries for every section and selected targets. Back links
return to the relevant route. Submit the accumulated state through a TanStack
Query mutation, disable duplicate submission, map DRF field errors to the
appropriate step/summary, reset the store only after success, invalidate the
owner-scoped list query, and navigate to the list/detail success destination.

## Step implementation contract

Each data-entry step follows the same sequence:

1. Read previously validated values from `useStateMachine`.
2. Create one step-local `useForm` with `zodResolver(stepSchema)` and
   `defaultValues` from the draft.
3. Advance only inside the valid `handleSubmit` callback.
4. Normalize and merge only that step's values into the state machine.
5. Navigate to the next route with TanStack Router.
6. Use a `type="button"` Back action; saved values restore through
   `defaultValues`.

Direct route entry must redirect to the earliest incomplete step. A route-level
completion helper should use the same feature schemas to determine this rather
than trusting a mutable `currentStep` counter. Browser refresh resets the
in-memory draft and therefore returns to step 1.

Only the review step sends the full payload to the API. Full validation is
repeated on that step and on the server.

## Suggested frontend files

```text
src/components/multi-step-form/
  multi-step-form-shell.tsx
  multi-step-progress.tsx
  multi-step-sidebar.tsx
  form-field-paper.tsx
  wizard-actions.tsx
  use-wizard-step.ts
  index.ts
src/features/recurring-fees/
  api-types.ts
  form-store.ts
  schemas.ts
  wizard-definition.ts
  recurring-fees-page.tsx
  steps/details-step.tsx
  steps/pricing-step.tsx
  steps/schedule-step.tsx
  steps/targets-step.tsx
  steps/review-step.tsx
  index.ts
src/hooks/quickApi/
  useRecurringFees.ts
  useCreateRecurringFee.ts
  useUpdateRecurringFee.ts
```

Add thin route files under `src/routes/_authRoutes/` for the list and each step.
If TanStack Router layout routes make the shared `/new` shell cleaner, use a
pathless/layout route while preserving distinct URLs.

## Verification plan

### Backend

- Model/serializer tests for fixed and goal pricing branches, every schedule
  combination, decimal bounds, date ordering, and target uniqueness.
- Permission tests for unauthenticated users, viewer versus manager/admin,
  reseller, re-reseller, and store owners.
- Hierarchy tests proving only direct children are accepted, including the
  reseller → re-reseller → store grandchild case.
- Tests that owner and created-by are server-derived.
- Transaction/update tests showing retained target setup state is preserved.
- Endpoint list/detail scope tests preventing cross-owner access.
- Run `docker compose exec web ruff check` and
  `docker compose exec web python manage.py test quickportal`.

### Frontend

- Schema tests for conditional pricing/schedule branches and date bounds.
- Component tests for route guards, step validation, Back value restoration,
  direct-route redirects, owner changes, dynamic charge controls, and API error
  mapping.
- Responsive assertions for sidebar/collapsed layouts and accessibility checks
  for progress, errors, labels, keyboard navigation, and focus movement.
- Mutation test confirming the API request occurs only at Review and the store
  resets only after success.
- Run `npm run test`, `npm run lint`, and `npm run build`.

## Implementation sequence

1. Resolve the goal metric, business-day calendar, month-overflow behavior, and
   whether deletion/editing after charges is allowed.
2. Add backend enums/models, constraints, migration, domain validation, admin
   registration, serializers, owner-scoped endpoints, and tests.
3. Add the direct-child query contract needed by the target picker.
4. Install and initialize `little-state-machine`; add reusable wizard
   primitives and their tests.
5. Add Recurring Fees schemas/store, query hooks, navigation entry, routes, and
   reseller/re-reseller guard.
6. Implement the five steps and final payload mapping.
7. Verify responsive/accessibility behavior, full API integration, and both
   repositories' required checks.

## Decisions required before implementation

1. What exactly is the “goal” metric and which system supplies its measured
   value for a recurrence period?
2. Does “business day” exclude only weekends or also Brazilian national/local
   holidays, and in which timezone?
3. What happens to day 29–31 schedules in shorter months? The recommendation is
   the final calendar day.
4. Can a recurrence configuration or target set change after charges exist? If
   so, which changes preserve versus restart setup/next-charge state?
5. Is this release configuration-only, or must it also include a scheduler,
   charge ledger, retries, idempotency, and OWN/payment-provider execution?
6. Should re-reseller owners target only their stores (recommended direct-child
   rule), and reseller owners target both direct re-resellers and direct stores?

## Source pattern

This design specializes the local note “Multi-Step Forms with React Hook Form
and Little State Machine” for Quick Portal. It retains its core contract:
route-per-step forms, one RHF instance per step, pure shared-state merges,
restored Back navigation, final-step submission, full server validation, and
guards for incomplete direct-route access. It replaces the note's React Router
examples with TanStack Router and its plain HTML controls with reusable Material
UI components.
