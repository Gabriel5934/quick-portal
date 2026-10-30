# Onboarding
Related doc: [Cielo Seller Onboarding](../cielo/seller-onboarding)

One of the features in Cielo Split API is the onboarding of sellers so they can participate in payment split.

Quick API acts like a gateway for this endpoint by receiving the payload, authenticating and making the request to Cielo and only after a successful creating our own entry for the seller on our database.