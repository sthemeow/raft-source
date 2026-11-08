# Self-hosted OIDC sign-in (Authentik)

Raft can sign users in through an external OpenID Connect provider. The server
side is provider-agnostic, but this note uses Authentik because that is the
deployment we run; the same steps apply to any conformant provider.

Scope: browser sign-in only. Desktop and native mobile are deliberately not
enabled for this provider yet.

## Configuration

Set these on the API service (values belong in the deployment's own env file,
never in the repository):

| Variable | Required | Meaning |
|---|---|---|
| `OIDC_ISSUER` | yes | Issuer URL, exactly as the provider publishes it, **including any trailing slash**. |
| `OIDC_CLIENT_ID` | yes | Client ID of the Raft application in the provider. |
| `OIDC_CLIENT_SECRET` | yes | Client secret. Confidential client; PKCE is used in addition. |
| `OIDC_REDIRECT_URI` | yes | Must match the provider registration byte for byte, e.g. `https://<raft-host>/api/auth/oidc/callback`. |
| `OIDC_SCOPES` | no | Defaults to `openid email profile`. |
| `OIDC_AUTO_START` | no | `true` enables a bounded silent (`prompt=none`) attempt in browser tabs. Off by default. |

If any required value is missing the provider is simply not offered; a partial
configuration never shows a button that cannot work.

## Authentik application setup

1. **Provider:** create an OAuth2/OpenID provider, client type *confidential*,
   redirect URI as configured above, scopes `openid`, `email`, `profile`.
2. **Signing key — required.** Select an **RSA** signing key on the provider.
   Authentik's default has no signing key and advertises **HS256** only; Raft
   accepts RS256 only, so every login fails ID-token verification until an RSA
   key is chosen. This is the most common setup failure.
3. **Access policy — required to control who may sign in.** Bind the intended
   group (for example `raft`) to the application. With open sign-up, omitting
   this lets any account the provider can authenticate reach Raft.
4. **Email verification.** Authentik's default email mapping is *unverified*,
   and that is supported end to end.
   - An identity that is already linked signs in on its `(issuer, subject)`
     pair regardless of the email claim.
   - The **first** link is created from Settings by an already signed-in user:
     an explicit action, checked against that user. It does not depend on the
     email verification, so an existing signed-in user can link with Authentik's
     defaults. The provider must still return an email claim.
   - A verified email is required only for creating a new account, or for the
     link proposal that follows an email conflict. Linking always needs
     explicit confirmation.
   - Linking **never** marks the Raft account's email verified unless the
     provider says it is. An unverified claim cannot upgrade an account.
5. **Settings that fail silently if changed.** Authentik's defaults are
   correct; these are the ones to leave alone:
   - **Include claims in id_token** stays ticked. Raft reads the email and name
     from the ID token and never calls the userinfo endpoint, so without it
     every login fails with "missing required identity fields".
   - **Encryption Key** stays empty. An encrypted ID token cannot be verified
     as a signed JWT, and the error looks like a generic invalid token.
   - **Issuer mode** stays at the default (one issuer per provider).
   - **Subject mode** must not change once anyone has linked: the identity key
     is issuer plus subject, so changing either orphans every existing link.
   - There is no separate PKCE switch — Authentik supports `S256`
     automatically, as its discovery document shows.

6. **Linking prompt.** The account-link flow sends `prompt=select_account`.
   Authentik does not advertise that value; it is expected to ignore it, but
   confirm during the first real integration test.

## First sign-in on a new deployment

With Authentik's default unverified email claim, first create a password
account and sign in. Then connect SSO in Settings → Connected accounts. The
linked identity can subsequently sign in without relying on email verification.
If the provider supplies a verified email, a new account may also be created
through OIDC.

## Authentik forward authentication

For a public deployment, retain the existing Authentik gate and group check
before Raft. Strip incoming `X-Authentik-*` headers before the gate, as in the
existing Raft Caddy route. Configure an implicit-consent authorization flow to
avoid an extra consent prompt. Test the complete gateway, provider and callback
journey: the gateway must recognize the user's Authentik session on the return
request. A trusted-address-only test route does not verify that public journey.

## How sign-in behaves

- The identity key is the pair `(issuer, subject)`; the subject alone is not
  used, so two providers cannot collide.
- ID tokens are verified against the provider's JWKS: RS256 by key id, exact
  issuer, audience, `exp`/`iat`, nonce, and `azp` when several audiences are
  present.
- Authorization uses PKCE S256. The verifier is kept in an httpOnly cookie
  named after the nonce, so several tabs starting at once do not overwrite one
  another. Cookies expire after ten minutes.
- `silent=1` becomes `prompt=none` only when `OIDC_AUTO_START` is on, and only
  for a normal login, never for an account link. A user without a provider
  session comes back with `login_required` and sees the normal login page; that
  is expected, not an error to retry in a loop.
- Raft logout stays local. It does not end the provider session or sign the
  user out of other applications. After explicit logout, silent sign-in is
  suppressed in that browser until a user signs in deliberately.

## Database migration and later upgrades

This change includes the on-prem migration `0374_onprem_oidc_email_verified`.
Rehearse the migration against a copy of the actual database and verify the
backup before any live deployment. The local migration timestamp is just after
upstream 0373; it does not guarantee that a later upstream migration will be
ordered after it.

Before an upstream upgrade, inspect both migration journals and plan the
on-prem migration's ordering and any necessary renumbering. Test the resulting
migration sequence on a database copy before applying it to the live system;
do not rely on file names alone to establish which migrations will run.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "invalid ID token" on every login | No RSA signing key selected in Authentik (HS256 only). |
| `oidc_issuer_mismatch` | `OIDC_ISSUER` differs from the provider's issuer, usually a missing trailing slash. |
| "sign-in link is invalid or expired" | Redirect URI mismatch, or the ten-minute state window elapsed. |
| Login succeeds at the provider, then Raft shows the login page | Silent start requested without a provider session; expected. |
| "This SSO account email belongs to another Raft account" when linking | The provider email matches a *different* Raft account. Fails safe: the link is refused rather than merging accounts. Use an email that is either the account's own or unused. |
