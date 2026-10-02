# IsraLabs — website

Static site. No build step: deploy the contents of `public/`.

## Structure
- public/index.html — the whole site (EN/HE; `?lang=he` loads Hebrew)
- public/404.html — not-found page
- public/favicon.svg
- public/assets/ — fonts, images, page runtime, and video
- public/robots.txt, public/sitemap.xml — SEO, point to https://isralabs.org
- public/_headers — Cloudflare Pages static-response headers
- vercel.json — Vercel headers and redirect; remains at the repository root
- _redirects — legacy Netlify domain redirects; excluded from `public/` because Cloudflare Pages does not support domain-level sources

## Deploy
Vercel: keep the project root at the repository root and framework preset `Other`; its default output directory selects `public/` when present. Check any dashboard override before deploying.
Cloudflare Pages: connect this repository to a **Pages** project; set the build output directory to `public` (Cloudflare recommends `exit 0` as the build command when using Pages Functions).
Only one provider should own the production domain at a time. Configure old-domain redirects in the active host's dashboard; see [deployment handoff](docs/deployment-handoff.md).

## Contact form (Netlify Forms)
The form is wired to Netlify Forms — no third-party service, no keys.
- `<form name="contact" data-netlify="true">` with a `bot-field` honeypot; submits via fetch to `/`, so the page never reloads.
- Netlify detects the form on deploy. Submissions appear in **Site → Forms → contact**.
- Email notifications are OFF by default: Site configuration → Notifications → **Add notification → Form submission** → enter the address to notify.
- Free tier: 100 submissions/month.
- It only works on Netlify. On Vercel or Cloudflare, the send will fail until the form handler is migrated; see [deployment handoff](docs/deployment-handoff.md).

## Notes
- Fonts are WOFF (supported everywhere). For WOFF2 (~25% smaller again), run the OTF originals through a WOFF2 converter and update fonts.css.
- Ministry of Finance logo loads from Wikimedia (external). Replace with a local file in assets/img if you prefer.
- No external scripts or analytics.
