# Plans

Plans are are a collection of fees specific to an activity. OWN provides a set of base fees and businesses can add their
comissions on top of that.

Fees are informed when registering a business by passing the value and the id of the related OWN fee.
The value stored in `OwnPlanFee` is the markup entered in the portal. The signup payload sends that value unchanged; it does not add `OwnFee.value` or `baseMdr`.

Plans belong to a business of any type, stores included. `created_by` and `updated_by` record the users who changed the plan. `GET /own/plans/?business={id}` lists only that business's own plans, for any member of it. Creation uses the same `business` query parameter to set the owner; creating, updating, and deleting plans require an admin of the owner. Existing plans without an owner cannot be listed or used for signup.

An OWN signup registers the business itself and must use one of that business's own plans; plans of its parent or any other business are rejected. Creating, correcting, retrying, and reconciling a signup require an admin of the business.

The plan form uses baskets 117 (Bandeira) and 333 (Parcela). It submits one `{ "fee": <OWN fee id>, "value": <markup> }` entry per product in the selected basket. The "Padrão" network tab only fills matching real network entries in the form. Automatic anticipation is represented by `anticipation_type`, and the basket's anticipation fee is read separately.

## Activities

OWN provides a list that relates CNAES to MCCs trough the `/consultarAtividades` endpoint. The raw response of this endpoint is saved
as a json file under /app named "load_consultar_atividades" and a management command called "load_own_activities" is used to seed
the own activities table.
