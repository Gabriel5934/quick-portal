# Plans

Plans are are a collection of fees specific to an activity. OWN provides a set of base fees and businesses can add their
comissions on top of that.

Fees are informed when registering a business by passing the value and the id of the related OWN fee.
The value stored in `OwnPlanFee` is the markup entered in the portal. The signup payload sends that value unchanged; it does not add `OwnFee.value` or `baseMdr`.

Plans belong to a reseller or re-reseller business. `created_by` and `updated_by` record the users who changed the plan. With `GET /own/plans/?business={id}`, a reseller sees its plans and those of its direct re-resellers; a re-reseller sees only its own business's plans. Creation uses the same `business` query parameter to set the owner. Existing plans without an owner must be assigned to a business before they appear in scoped lists.

For OWN signup, `GET /own/plans/?signup_business={target_business_id}` lists only plans owned by the target business's parent. A reseller signing up a re-reseller therefore selects one of the reseller's plans; signing up a store under a re-reseller uses that re-reseller's plans. The user needs manager or administrator access to both the target and the plan owner. The signup API checks the same parent ownership rule when validating a selected plan. A root business uses its own plans.

The plan form uses baskets 117 (Bandeira) and 333 (Parcela). It submits one `{ "fee": <OWN fee id>, "value": <markup> }` entry per product in the selected basket. The "Padrão" network tab only fills matching real network entries in the form. Automatic anticipation is represented by `anticipation_type`, and the basket's anticipation fee is read separately.

## Activities

OWN provides a list that relates CNAES to MCCs trough the `/consultarAtividades` endpoint. The raw response of this endpoint is saved
as a json file under /app named "load_consultar_atividades" and a management command called "load_own_activities" is used to seed
the own activities table.
