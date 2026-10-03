import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

assert.ok(existsSync(new URL('../worker.mjs', import.meta.url)), 'contact Worker must exist');
const { default: worker } = await import('../worker.mjs');
const sent = [];
const env = {
  CONTACT_TO_EMAIL: 'inbox@example.com', CONTACT_FROM_EMAIL: 'website@example.org',
  TURNSTILE_SITE_KEY: 'public-key', TURNSTILE_SECRET_KEY: 'secret-key',
  TURNSTILE_HOSTNAME: 'isralabs.org',
  CONTACT_EMAIL: { send: async message => { sent.push(message); } },
  ASSETS: { fetch: async () => new Response('static asset') },
};
const fields = { name: 'Visitor', email: 'visitor@example.net', subject: 'Hello\nWorld', 'cf-turnstile-response': 'token' };
const request = (data = fields, options = {}) => new Request('https://isralabs.org/api/contact', {
  method: 'POST', body: new URLSearchParams(data), ...options,
});
const originalFetch = globalThis.fetch;
let verification = { success: true, hostname: 'isralabs.org', action: 'contact' };
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.equal(JSON.parse(options.body).secret, 'secret-key');
  return Response.json(verification);
};
try {
  for (const name of ['Visitor', 'מבקר']) {
    const response = await worker.fetch(request({ ...fields, name, to: 'attacker@example.com' }), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.equal(sent.at(-1).to, env.CONTACT_TO_EMAIL);
    assert.equal(sent.at(-1).from, env.CONTACT_FROM_EMAIL);
    assert.equal(sent.at(-1).replyTo, fields.email);
    assert.equal(sent.at(-1).subject, 'IsraLabs website contact');
    assert.ok(sent.at(-1).text.includes(name));
    assert.ok(sent.at(-1).text.includes(fields.subject));
  }
  const configRequest = new Request('https://isralabs.org/api/contact-config');
  let config = await worker.fetch(configRequest, env);
  assert.equal(config.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await config.json(), { fallbackEmail: env.CONTACT_TO_EMAIL, siteKey: 'public-key' });
  const changed = { ...env, CONTACT_TO_EMAIL: 'new@example.com', CONTACT_FALLBACK_EMAIL: 'help@example.com' };
  config = await worker.fetch(configRequest, changed);
  assert.deepEqual(await config.json(), { fallbackEmail: 'help@example.com', siteKey: 'public-key' });
  await worker.fetch(request(), changed);
  assert.equal(sent.at(-1).to, 'new@example.com');

  const before = sent.length;
  for (const data of [
    { ...fields, name: '' }, { ...fields, email: 'wrong' },
    { ...fields, email: 'visitor@example.net\r\nBcc: other@example.com' },
    { ...fields, name: 'x'.repeat(201) }, { ...fields, name: 'Visitor\nInjected' },
    { ...fields, subject: '' }, { ...fields, subject: 'x'.repeat(5001) },
    { ...fields, 'bot-field': 'robot' }, { ...fields, 'cf-turnstile-response': '' },
  ]) assert.equal((await worker.fetch(request(data), env)).status, 400);
  assert.equal((await worker.fetch(request({ ...fields, subject: 'x'.repeat(33000) }), env)).status, 413);
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(17000)); controller.enqueue(new Uint8Array(17000)); controller.close();
  } });
  assert.equal((await worker.fetch(request(fields, { body: stream, duplex: 'half', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }), env)).status, 413);
  assert.equal((await worker.fetch(request(fields, { body: 'name=One&name=Two' }), env)).status, 415);
  assert.equal((await worker.fetch(request(fields, { body: new URLSearchParams([...Object.entries(fields), ['name', 'Other']]) }), env)).status, 400);
  for (const missing of ['CONTACT_TO_EMAIL', 'CONTACT_FROM_EMAIL', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'TURNSTILE_HOSTNAME', 'CONTACT_EMAIL']) {
    assert.equal((await worker.fetch(request(), { ...env, [missing]: undefined })).status, 503);
    assert.equal((await worker.fetch(configRequest, { ...env, [missing]: undefined })).status, 503);
  }
  for (const invalid of [
    { CONTACT_TO_EMAIL: 'a@example.com\nBcc: b@example.com' },
    { CONTACT_FROM_EMAIL: 'invalid' }, { CONTACT_FALLBACK_EMAIL: 'invalid' },
    { TURNSTILE_HOSTNAME: 'https://isralabs.org' },
  ]) assert.equal((await worker.fetch(request(), { ...env, ...invalid })).status, 503);
  for (const result of [
    { ...verification, success: false }, { ...verification, hostname: 'evil.example' },
    { ...verification, action: 'other' },
  ]) {
    verification = result;
    assert.equal((await worker.fetch(request(), env)).status, 400);
  }
  assert.equal(sent.length, before);
  globalThis.fetch = async () => { throw new Error('Siteverify unavailable'); };
  assert.equal((await worker.fetch(request(), env)).status, 502);
  verification = { success: true, hostname: 'isralabs.org', action: 'contact' };
  globalThis.fetch = async () => Response.json(verification);
  for (const reason of ['unverified recipient', 'email service unavailable']) {
    assert.equal((await worker.fetch(request(), { ...env, CONTACT_EMAIL: { send: async () => { throw new Error(reason); } } })).status, 502);
  }
  assert.equal((await worker.fetch(new Request('https://isralabs.org/api/contact'), env)).status, 405);
  assert.equal(await (await worker.fetch(new Request('https://isralabs.org/'), env)).text(), 'static asset');
  const configFile = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url)));
  assert.equal(configFile.keep_vars, true);
  assert.deepEqual(configFile.send_email, [{ name: 'CONTACT_EMAIL' }]);
  assert.equal(configFile.assets.directory, './public');
  console.log('Contact Worker checks passed (validation, EN/HE, configuration, Turnstile, email failures, static routing).');
} finally { globalThis.fetch = originalFetch; }
