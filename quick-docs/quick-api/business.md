---
description: Describes the business scope feature.
---

# Business

Business is a top-level scope for users. Each user can be related to many businesses trough a membership table.

Business available to the user can be fetch using an authenticated GET endpoint `/businesses`.

Business-scoped endpoints expect the currently selected business CNPJ to some in a `X-Business-Cnpj` request header.

This feature already supports alphanumeric CNPJs.
