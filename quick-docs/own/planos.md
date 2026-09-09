# Plans

Plans are are a collection of fees specific to an activity. OWN provides a set of base fees and businesses can add their
comissions on top of that.

Fees are informed when registering a business by passing the value and the id of the related OWN fee.

## Activities

OWN provides a list that relates CNAES to MCCs trough the `/consultarAtividades` endpoint. The raw response of this endpoint is saved
as a json file under /app named "load_consultar_atividades" and a management command called "load_own_activities" is used to seed
the own activities table.
