---
title: Business
description: The Django model used to represent stores, resellers, and re-resellers.
---

# Business model

`Business` represents a company or individual operating in Quick Portal. A
business can be a store, a reseller, or a re-reseller, and may participate in a
parent-child hierarchy.

The model is defined in `quickportal.models` and uses the `business` database
table.

## Fields

| Field | Django type | Required | Description |
| --- | --- | --- | --- |
| `id` | `AutoField` | Generated | Primary key added by Django. |
| `type` | `CharField(max_length=20)` | Yes | Business role in the hierarchy. See [business types](#business-types). |
| `parent` | `ForeignKey("self", on_delete=PROTECT)` | No | Parent business. The reverse relation is available as `children`. |
| `document_type` | `CharField(max_length=4)` | Yes | Either `CPF` or `CNPJ`. |
| `document` | `CharField(max_length=20)` | Yes | CPF or CNPJ containing digits only when written through the API. |
| `name` | `CharField(max_length=200)` | Yes | Legal name. |
| `trade_name` | `CharField(max_length=200, blank=True)` | No | Trading name. Empty for CPF businesses. |
| `cnae` | `ForeignKey(Cnae, on_delete=PROTECT)` | No | Economic activity. The reverse relation is available as `businesses`. |
| `email` | `EmailField` | Yes | Contact email address. |
| `phone` | `CharField(max_length=20)` | Yes | Primary phone number; the API accepts digits only. |
| `landline` | `CharField(max_length=20, blank=True)` | No | Optional landline; the API accepts digits only. |
| `status` | `CharField(max_length=20)` | Yes | Onboarding status. Defaults to `NOT_STARTED`; `PENDING` is also supported. |

The model does not currently declare a uniqueness constraint for `document`.

## Business types

The `BusinessType` choices define the permitted hierarchy:

| Type | Parent rule | Allowed direct children |
| --- | --- | --- |
| `RESELLER` | Must be a root business | `RE_RESELLER`, `STORE` |
| `RE_RESELLER` | Must belong to a `RESELLER` | `STORE` |
| `STORE` | May be a root business or belong to a `RESELLER` or `RE_RESELLER` | None |

A business cannot be its own parent. The database enforces this particular
rule with the `business_parent_not_self` check constraint. The remaining
hierarchy rules are implemented by `Business.clean()` and repeated by the API
serializer.

Because `parent` uses `on_delete=PROTECT`, a business cannot be deleted while
it has children.

## CPF and CNPJ data

The API treats identity data differently according to `document_type`:

- For `CPF`, clients provide `name` and `cnae`; `trade_name` remains empty.
- For `CNPJ`, clients must not provide `name`, `trade_name`, or `cnae`. The API
  fetches them from BrasilAPI and maps `razao_social` to `name`,
  `nome_fantasia` to `trade_name`, and `cnae_fiscal` to `cnae`.
- `document` and `document_type` cannot be changed through the API after the
  business is created.

These are serializer-level rules rather than database constraints. Code that
creates or updates `Business` objects directly should validate the same
invariants explicitly and call `full_clean()` when model validation is needed.

## Relationships

- `children` returns the business's direct child businesses.
- `memberships` connects users to the business through `BusinessMembership`.
- A membership grants access to its business and, according to the access
  service, to businesses below it in the hierarchy.
- `color_preferences` stores each user's display color for the business.

## Example

```python
from quickportal.models import Business, BusinessType, Cnae, DocumentType

cnae = Cnae.objects.get(code="4711302")

store = Business(
    type=BusinessType.STORE,
    document_type=DocumentType.CPF,
    document="52839789801",
    name="Gabriel Store",
    cnae=cnae,
    email="gabriel@example.com",
    phone="11987023510",
)
store.full_clean()
store.save()
```

Using `full_clean()` before `save()` is important when working outside Django
REST Framework because Django does not run model validation automatically when
`save()` is called.
