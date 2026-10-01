# IsraLabs — website

Static site. No build step: upload the folder contents as-is to the root of your host.

## Structure
- index.html — the whole site (EN/HE; `?lang=he` loads Hebrew)
- 404.html — not-found page
- favicon.svg
- assets/css/fonts.css — @font-face declarations (WOFF)
- assets/fonts/ — Untitled Sans, Untitled Serif, Ploni (WOFF)
- assets/img/ — photos, logos, icons; assets/img/team/ — board portraits
- assets/js/isralabs-runtime.js — page runtime (required)
- assets/video/space-loop.mp4 — thumbnail loop for the first News card (only video on the site)
- robots.txt, sitemap.xml — SEO, point to https://isralabs.org
- _headers, _redirects — Netlify · vercel.json — Vercel · .htaccess — Apache/cPanel (each host ignores the others)

## Deploy
Netlify: drag the folder onto app.netlify.com/drop, or connect a repo with publish dir = this folder and no build command.
Vercel: `vercel --prod` from inside the folder (framework: Other).
Then add isralabs.org in the host dashboard and set DNS as instructed. Attach old domains (isralabs.org.il, www) to the same site so the redirects apply.

## Contact form (Netlify Forms)
The form is wired to Netlify Forms — no third-party service, no keys.
- `<form name="contact" data-netlify="true">` with a `bot-field` honeypot; submits via fetch to `/`, so the page never reloads.
- Netlify detects the form on deploy. Submissions appear in **Site → Forms → contact**.
- Email notifications are OFF by default: Site configuration → Notifications → **Add notification → Form submission** → enter the address to notify.
- Free tier: 100 submissions/month.
- It only works on Netlify. On another host the send will fail (the form shows an error) — swap in Formspree/Web3Forms instead.

## Notes
- Fonts are WOFF (supported everywhere). For WOFF2 (~25% smaller again), run the OTF originals through a WOFF2 converter and update fonts.css.
- Ministry of Finance logo loads from Wikimedia (external). Replace with a local file in assets/img if you prefer.
- No external scripts or analytics.
