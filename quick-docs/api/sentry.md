# Sentry

Sentry is setup to monitor both the Django and React apps.

## Personal data

No personal data protected under LGPD is sent to Sentry. Both SDKs set
`data_collection` (`dataCollection` in React) explicitly, because
`send_default_pii=False` alone still sends request bodies and stack frame
variables. Events carry no user, IP address, cookies, request or response
bodies, stack frame variables or SQL query parameters. Session replays mask all
text and block media.

## TODO

Deploy:
In Sentry, go to Settings → Auth Tokens and create an organization auth token. Keep it out of the repo.
On Quick-portal-api-env-qa, set SENTRY_DSN to the quick-portal-api DSN and SENTRY_ENVIRONMENT=qa.
On quick-portal-web-env, set VITE_SENTRY_DSN to the quick-portal-web DSN and SENTRY_AUTH_TOKEN to the token. The frontend build will then upload hidden source maps and delete the .map files, so they’re never served.
Optional: set SENTRY_RELEASE (for example the git SHA) on both, so each error is linked to the deploy that introduced it.
Deploy, then cause one error in production to confirm its frames are readable. Errors from before the upload won’t get readable traces after the fact.

Next steps:
The sentry-instrument skill can add profiling, metrics or crons, and sentry-setup-releases can link errors to commits and deploys.
