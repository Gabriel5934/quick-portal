check before shipping:

Third-party cookie blocking: Safari and Firefox block third-party cookies by default, and Chrome’s policy has changed over time. Login could fail for some users. Verify current behavior in each browser before release. The long-term fix is to serve the API under the frontend’s domain, for example through a proxy path, which would let the cookie use SameSite=Lax.
Dev environment: browsers reject a SameSite=None cookie unless it is also Secure. Local development runs over HTTP (USE_HTTPS=0). Chrome and Firefox accept Secure cookies on http://localhost, but confirm this in the setup, or run the dev API over HTTPS.
Reuse is strict: any race that presents a rotated token logs the user out everywhere. The cross-tab lock is the main protection, so it should be tested with two tabs open.
Existing users: their localStorage refresh tokens stop working, so they log in once after deploy. Backend and frontend ship in the same PR.
