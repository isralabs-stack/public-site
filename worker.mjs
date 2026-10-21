const MAX_BODY = 32 * 1024;
const emailPattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;
const validEmail = value => typeof value === 'string' && value.length <= 254 && emailPattern.test(value);
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

function configured(env) {
  return validEmail(env.CONTACT_TO_EMAIL) && validEmail(env.CONTACT_FROM_EMAIL)
    && (env.CONTACT_FALLBACK_EMAIL === undefined || validEmail(env.CONTACT_FALLBACK_EMAIL))
    && typeof env.TURNSTILE_SITE_KEY === 'string' && /^[\w-]{1,100}$/.test(env.TURNSTILE_SITE_KEY)
    && typeof env.TURNSTILE_SECRET_KEY === 'string' && /^[\w-]{1,200}$/.test(env.TURNSTILE_SECRET_KEY)
    && typeof env.TURNSTILE_HOSTNAME === 'string' && /^[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/.test(env.TURNSTILE_HOSTNAME)
    && typeof env.CONTACT_EMAIL?.send === 'function';
}

async function contact(request, env) {
  if (!configured(env)) return json({ error: 'unavailable' }, 503);
  if (Number(request.headers.get('content-length')) > MAX_BODY) return json({ error: 'too_large' }, 413);
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/x-www-form-urlencoded') {
    return json({ error: 'unsupported_content_type' }, 415);
  }
  // Count actual bytes as well: Content-Length can be absent or dishonest.
  const reader = request.body?.getReader();
  let text = '', bytes = 0;
  const decoder = new TextDecoder();
  try {
    if (reader) while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY) {
        await reader.cancel();
        return json({ error: 'too_large' }, 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch { return json({ error: 'invalid_body' }, 400); }
  const data = new URLSearchParams(text);
  const limits = { name: 200, email: 254, subject: 5000, 'bot-field': 200, 'cf-turnstile-response': 2048 };
  for (const [field, limit] of Object.entries(limits)) {
    const values = data.getAll(field);
    if (values.length > 1 || (values[0]?.length || 0) > limit) return json({ error: 'invalid_fields' }, 400);
  }
  const name = data.get('name') || '', email = data.get('email') || '', subject = data.get('subject') || '';
  const token = data.get('cf-turnstile-response') || '';
  if (!name.trim() || /[\x00-\x1f\x7f]/.test(name) || !validEmail(email)
    || !subject.trim() || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(subject)
    || data.get('bot-field') || !token.trim()) return json({ error: 'invalid_fields' }, 400);
  let result;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return json({ error: 'verification_unavailable' }, 502);
    result = await response.json();
  } catch { return json({ error: 'verification_unavailable' }, 502); }
  if (result?.success !== true || result.hostname !== env.TURNSTILE_HOSTNAME || result.action !== 'contact') {
    return json({ error: 'invalid_challenge' }, 400);
  }
  try {
    await env.CONTACT_EMAIL.send({
      to: env.CONTACT_TO_EMAIL, from: env.CONTACT_FROM_EMAIL,
      replyTo: email, subject: 'IsraLabs website contact',
      text: `Name: ${name.trim()}\nEmail: ${email}\n\nMessage:\n${subject.trim()}\n`,
    });
  } catch { return json({ error: 'email_unavailable' }, 502); }
  return json({ success: true });
}

// Hebrew link previews. Crawlers (WhatsApp, Facebook, LinkedIn, X) read the raw HTML and do not run
// the page script that switches language, so for /?lang=he the share tags are swapped here.
const HE_META = {
  title: 'ישראלאבס | הפלטפורמה הלאומית לתגליות מדעיות',
  description: 'מקדמים את הדור הבא של התגליות המדעיות: מימון מחקר ארוך טווח, תשתיות מחקר לאומיות ומודלים חדשים לשיתופי פעולה.',
  url: 'https://isralabs.org/?lang=he',
  image: 'https://isralabs.org/assets/img/og-image-he.jpg',
  imageAlt: 'ישראלאבס. בונים את עתיד המדע',
};
const escapeAttr = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function localizeHead(html) {
  const head = html.indexOf('</head>');
  if (head === -1) return html;
  const set = (attr, key, value) => {
    const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`);
    return part => part.replace(re, `$1${escapeAttr(value)}$2`);
  };
  const edits = [
    set('property', 'og:title', HE_META.title),
    set('property', 'og:description', HE_META.description),
    set('property', 'og:url', HE_META.url),
    set('property', 'og:image', HE_META.image),
    set('property', 'og:image:alt', HE_META.imageAlt),
    set('property', 'og:locale', 'he_IL'),
    set('property', 'og:locale:alternate', 'en_US'),
    set('name', 'twitter:title', HE_META.title),
    set('name', 'twitter:description', HE_META.description),
    set('name', 'twitter:image', HE_META.image),
    set('name', 'twitter:image:alt', HE_META.imageAlt),
    set('name', 'description', HE_META.description),
    part => part.replace(/<title>[^<]*<\/title>/, `<title>${escapeAttr(HE_META.title)}</title>`),
    part => part.replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/, `$1${HE_META.url}$2`),
  ];
  const top = edits.reduce((part, edit) => edit(part), html.slice(0, head));
  return top + html.slice(head);
}

async function page(request, env) {
  const response = await env.ASSETS.fetch(request);
  const url = new URL(request.url);
  if (url.searchParams.get('lang') !== 'he' || !response.ok
    || !(response.headers.get('content-type') || '').includes('text/html')) return response;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('etag');
  return new Response(localizeHead(await response.text()), { status: response.status, headers });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/api/contact-config') {
      if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
      if (!configured(env)) return json({ error: 'unavailable' }, 503);
      return json({ fallbackEmail: env.CONTACT_FALLBACK_EMAIL ?? env.CONTACT_TO_EMAIL, siteKey: env.TURNSTILE_SITE_KEY });
    }
    if (path === '/api/contact') {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      return contact(request, env);
    }
    if ((path === '/' || path === '/index.html') && request.method === 'GET') return page(request, env);
    return env.ASSETS.fetch(request);
  },
};
