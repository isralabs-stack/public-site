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
    return env.ASSETS.fetch(request);
  },
};
