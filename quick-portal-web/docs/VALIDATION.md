# Multi-step form validation

## Problem

React Hook Form runs `_updateValid` whenever a `Controller` field mounts. With a
single `zodResolver(fullSchema)` on the form, this causes the resolver to validate
all fields — including empty fields from steps the user hasn't reached yet — and
pre-populate their errors on screen.

## Schema structure

```
step1BaseSchema   (ZodObject)
│
├── step1Schema   = step1BaseSchema + refineDocument
│                   used in handleNext to validate before advancing
│
└── newBusinessSchema = step1BaseSchema.extend(step2Fields) + refineDocument
                        used by the RHF resolver on final submit
```

`refineDocument` is the single source of truth for CPF/CNPJ validation. Both
schemas reference it, so implementing `validateCpf` / `validateCnpj` takes effect
everywhere at once.

`step1BaseSchema` must stay a plain `ZodObject` (not `ZodEffects`) so that
`.extend()` is available when building `newBusinessSchema`.

## Resolver strategy

A `submittedRef` boolean ref controls which schema the resolver uses:

```
submittedRef.current === false  →  resolver uses step1Schema
submittedRef.current === true   →  resolver uses newBusinessSchema
```

`submittedRef` starts `false` and is only set to `true` inside `handleSave`,
immediately before `handleSubmit` is called.

This means that while the user navigates between steps, `_updateValid` always runs
against `step1Schema`, which only knows about step 1 fields. Unvisited step fields
are invisible to Zod and receive no errors.

## Step navigation

**Advancing (handleNext)**

Validates the current step's fields by calling `step1Schema.safeParse` directly —
never through RHF's `trigger`. Using `trigger` would invoke the RHF resolver, which
at that point uses `step1Schema`, but `trigger` also sets `isSubmitted`-adjacent
internal state that can cause stale errors to appear on the next render. Direct
`safeParse` + `setError` is cleaner and fully contained.

```
handleNext()
  └── step1Schema.safeParse(getValues())
        ├── fail → setError for each issue → return (stay on step 1)
        └── pass → clearErrors(step1Fields) → setStep(n + 1)
```

**Submitting (handleSave)**

```
handleSave()
  ├── submittedRef.current = true   ← switches resolver to newBusinessSchema
  └── handleSubmit(onSubmit)()
        ├── fail → resolver returns step 2 errors → displayed on screen
        └── pass → onSubmit(data) called
```

## Adding a new step

1. Create `stepNBaseSchema` (ZodObject) and `stepNSchema` (with any refinements).
2. Export `stepNFields` from the base schema's `.shape`.
3. Extend `newBusinessSchema` with the new step's fields.
4. Add a `handleNext` branch that calls `stepNSchema.safeParse` when leaving step N.

The resolver and `submittedRef` logic require no changes — they remain step-count
agnostic.
