# IsraLabs — website

Static site with a Cloudflare Worker for contact submissions. No build step.

## Structure
- public/index.html — the whole site (EN/HE; `?lang=he` loads Hebrew)
- public/404.html — not-found page
- public/favicon.svg
- public/assets/ — fonts, images, page runtime, and video
- public/robots.txt, public/sitemap.xml — SEO, point to https://isralabs.org
- public/_headers — Cloudflare Workers Static Assets response headers
- vercel.json — Vercel headers and redirect; remains at the repository root
- _redirects — legacy Netlify domain redirects; excluded from `public/`
- worker.mjs — contact API and static asset fallback
- wrangler.jsonc — Worker entrypoint, email binding, and `./public` asset directory
- tests/ — runnable Node checks; no test dependencies

## Deploy
Cloudflare Workers: the Git-connected project runs `npx wrangler deploy` with no build command. `wrangler.jsonc` publishes only `public/`; the first Worker deployment using this layout succeeded on 2026-10-02. The `workers.dev` URL is for migration testing, not proof that the contact form works.
Vercel: keep the project root at the repository root and framework preset `Other`; its default output directory selects `public/` when present. Verify its next Git deployment after this layout change.
Only one provider should own the production domain at a time. Configure old-domain redirects in the active host's dashboard; see the local [deployment handoff](docs/deployment-handoff.md) (currently ignored by Git).

## Contact form (Cloudflare)

Cloudflare is the supported form host. `POST /api/contact` accepts URL-encoded `name`, `email`, `subject` (the message), `bot-field` (must be empty), and `cf-turnstile-response`. It rejects duplicate fields, header control characters, invalid email addresses, names over 200 characters, messages over 5,000 characters, tokens over 2,048 characters, and bodies over 32 KiB. Turnstile must validate with action `contact` and the configured hostname. Visitor input cannot select recipients.

The sole submission record is a plain-text email with subject `IsraLabs website contact` and the visitor's address as Reply-To. Success means Cloudflare accepted the send; it does not guarantee inbox delivery. There is no database, attachment support, automatic retry, or visitor auto-reply. A failed request preserves the visitor's text and refreshes the challenge; a manual retry after an uncertain network response can produce a duplicate email.

### Dashboard setup

1. In Cloudflare Email Service, onboard `isralabs.org` for **Email Routing** and allow Cloudflare to configure its MX, SPF, and DKIM records. Sending to verified account destinations works with Email Routing alone; separate Email Sending onboarding is unnecessary for this form. See [domain configuration](https://developers.cloudflare.com/email-service/configuration/domains/) and [verified destinations](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/). Optionally forward `website@isralabs.org` to Dana so the sender address also accepts incoming mail.
2. Add `dana.gourevich@gmail.com` as an account destination address and complete the verification email in that inbox. Every future `CONTACT_TO_EMAIL` must also be verified. The unrestricted `CONTACT_EMAIL` binding can send only to verified account destinations: [binding configuration](https://developers.cloudflare.com/email-service/configuration/send-bindings/).
3. Create a Turnstile widget for `isralabs.org`. For migration testing, add the Worker's exact `workers.dev` hostname to the widget and use a separate environment configured with that hostname. Do not broaden production hostname validation. See [Turnstile hostname management](https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/).
4. In **Workers & Pages → isralabs-website → Settings → Variables and Secrets**, set runtime values (not Build variables):

| Variable | Initial value / purpose |
| --- | --- |
| `CONTACT_TO_EMAIL` | `dana.gourevich@gmail.com` |
| `CONTACT_FALLBACK_EMAIL` | Optional; omit to use `CONTACT_TO_EMAIL`, or set a separate public help address |
| `CONTACT_FROM_EMAIL` | `website@isralabs.org` |
| `TURNSTILE_SITE_KEY` | Public widget site key |
| `TURNSTILE_SECRET_KEY` | Widget secret; add as a **Secret** |
| `TURNSTILE_HOSTNAME` | `isralabs.org` (exact expected Siteverify hostname, without scheme or path) |

Addresses are deliberately absent from Wrangler configuration. `keep_vars: true` preserves dashboard runtime variables on Git/Wrangler deployments; secrets are managed separately in Cloudflare. No address or key is built into the page. `GET /api/contact-config` returns only the public fallback address and site key with `Cache-Control: no-store`. Missing/invalid required configuration returns 503 without sending. A configured invalid fallback address also makes the form unavailable; delete the optional variable instead of leaving it empty. Email rejection (including unverified recipients) returns an error without claiming success.

Changing runtime addresses takes effect on subsequent API requests; reload an open page to refresh its displayed fallback. The fallback is public, so choose an address suitable for publication. Configure the Worker Custom Domain for `isralabs.org` before production checks.

### Local development and checks

Create an ignored `.dev.vars` at the repository root with the variable names above. An initial local file uses the planned addresses, `TURNSTILE_HOSTNAME="localhost"`, and empty key placeholders; fill in a development widget's keys before submitting. Keep real secrets out of Git. Use a development widget authorized for localhost; the handler still checks hostname and action. [Turnstile dummy keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) can test the widget, but their Siteverify hostname/action may differ, so use mocked verification in the automated checks rather than weakening production validation.

```sh
node tests/contact.mjs
node tests/contact-client.mjs
npx wrangler deploy --dry-run
npx wrangler dev
```

Local email simulation is not proof of inbox delivery. Before declaring production ready:

- Submit both English and Hebrew messages on the deployed domain and verify actual inbox receipt, UTF-8 text, and that Reply targets the visitor.
- Verify invalid fields/tokens and oversized requests fail; unverified recipients and email outages must preserve text and show failure.
- Change the verified runtime recipient and fallback, reload, and verify new delivery/display; delete the fallback to check defaulting.
- Remove a required variable in a test environment: configuration/submission must fail and show a generic retry message without an invented address.
- Verify `/`, `?lang=he`, `/assets/`, and 404 delivery, and inspect `/api/contact-config` for the two public fields only.
- Run a Git deployment and verify dashboard variables survive and another real submission arrives.

## Notes
- Fonts are WOFF (supported everywhere). For WOFF2 (~25% smaller again), run the OTF originals through a WOFF2 converter and update fonts.css.
- Ministry of Finance logo loads from Wikimedia (external). Replace with a local file in assets/img if you prefer.
- External runtime scripts load React/Babel; the contact form loads Cloudflare Turnstile. No analytics.
