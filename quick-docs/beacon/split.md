# Split

Every split call is registered alongside the related payment id and the request status. The write happens before the split request, setting the status initally to "pending" and moving to "failed" if it timesout or errors out. A constraint forbids a split request to be made if theres already a successful request registered for the same payment id.

```SQL
(payment_id) WHERE status = 'success' OR status = 'pending'
```
