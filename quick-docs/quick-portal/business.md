---
description: Describes the business scope feature.
---

# Business

Business is a top-level scope for users. Each user can be related to many businesses.

Users can select a business trough the auto complete located in the page header.

The selected business is stored in session storage and persists for the duration of the user session.

Requests to business-scoped endpoints must include a `X-Business-Cnpj` header with the currently selected business CNPJ.
