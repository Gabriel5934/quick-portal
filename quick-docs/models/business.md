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
| `email` | `EmailField` | Yes | Contact email address. |
| `phone` | `CharField(max_length=20)` | Yes | Primary phone number; the API accepts digits only. |
| `landline` | `CharField(max_length=20, blank=True)` | No | Optional landline; the API accepts digits only. |

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

- For `CPF`, clients provide `name`; `trade_name` remains empty.
- For `CNPJ`, clients must not provide `name` or `trade_name`. The API fetches
  them from BrasilAPI and maps `razao_social` to `name` and `nome_fantasia` to
  `trade_name`.
- `document` and `document_type` cannot be changed through the API after the
  business is created.

These are serializer-level rules rather than database constraints. Code that
creates or updates `Business` objects directly should validate the same
invariants explicitly and call `full_clean()` when model validation is needed.

## Relationships

- `children` returns the business's direct child businesses.
- `memberships` connects users to the business through `BusinessMembership`.
- A membership grants access to its own business only. Access does not cascade
  through the hierarchy: a member of a reseller cannot see or act on its
  children without a membership on each of them.
- `POST /api/businesses/` only creates stores without a parent; any other
  `type` or a `parent` returns `400`. Any authenticated user can create one, and
  the creator becomes its `ADMIN`.
- `invites` holds pending `BusinessInvite` grants. See
  [granting access](#granting-access).
- `color_preferences` stores each user's display color for the business.

## Granting access

Admins of a business grant access by email from the **Acessos** page. Each
grant is a `BusinessInvite` that is unique per business and (lowercased)
email; the email does not need a registered user. The invitee sees it on the
**Convites** page once signed in with that email, and accepting it replaces
the invite with a `BusinessMembership` carrying the invite's role. Declining
or revoking deletes the invite.

All endpoints require a JWT. The business-scoped ones also require the
`ADMIN` role on that business.

| Endpoint | Purpose |
| --- | --- |
| `GET`, `POST /api/businesses/<id>/invites/` | List or create pending invites (`email`, `role`). Each invite reports `registered`. |
| `PATCH`, `DELETE /api/businesses/<id>/invites/<pk>/` | Change the role of, or revoke, a pending invite. The email cannot change. |
| `GET /api/businesses/<id>/invites/email-status/?email=` | Whether an email belongs to a registered user. |
| `GET`, `PATCH`, `DELETE /api/businesses/<id>/memberships/[<pk>/]` | List accepted access, change its role, or revoke it. The final admin cannot be demoted or removed. |
| `GET /api/invites/` | Invites sent to the authenticated user's email. |
| `POST /api/invites/<pk>/accept/` | Accept an invite. An existing membership is kept unchanged. |
| `DELETE /api/invites/<pk>/` | Decline an invite. |

Emails that already have access or a pending invite on the business are
rejected with `{"email": [...]}`. Invites are matched to users by email only,
and sign-up does not verify email ownership.

## Example

```python
from quickportal.models import Business, BusinessType, DocumentType

store = Business(
    type=BusinessType.STORE,
    document_type=DocumentType.CPF,
    document="52839789801",
    name="Gabriel Store",
    email="gabriel@example.com",
    phone="11987023510",
)
store.full_clean()
store.save()
```

Using `full_clean()` before `save()` is important when working outside Django
REST Framework because Django does not run model validation automatically when
`save()` is called.
