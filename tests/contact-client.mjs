import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const source = html.match(/<script type="text\/x-dc" data-dc-script>([\s\S]*?)<\/script>/)[1];
let options, resets = 0, mode = 'success', posted;
const context = vm.createContext({
  DCLogic: class { setState(update) { Object.assign(this.state, update); } },
  URLSearchParams, AbortSignal, setTimeout, clearTimeout,
  FormData: class { constructor(form) { return new URLSearchParams(form.fields); } },
  document: { getElementById: () => ({}) },
  window: { turnstile: { render: (el, settings) => { options = settings; return 0; }, reset: () => { resets++; } } },
  fetch: async (url, init) => {
    if (url === '/api/contact-config') {
      if (mode === 'config-error') throw new Error('offline');
      return Response.json({ fallbackEmail: 'help@example.org', siteKey: 'public-key' });
    }
    assert.equal(url, '/api/contact');
    posted = new URLSearchParams(init.body);
    return mode === 'success' ? Response.json({ success: true }) : new Response('failed', { status: 502 });
  },
});
vm.runInContext(source + '\nthis.Component = Component;', context);
const component = new context.Component();
assert.equal(typeof component.initContact, 'function', 'form must load runtime configuration');
await component.initContact();
assert.equal(component.state.contactConfig.fallbackEmail, 'help@example.org');
assert.equal(options.action, 'contact');
assert.equal(options.sitekey, 'public-key');
for (const lang of ['en', 'he']) {
  component.state.lang = lang;
  const form = { fields: { name: lang === 'he' ? 'מבקר' : 'Visitor', email: 'visitor@example.org', subject: 'Message' },
    reset() { this.fields = {}; }, querySelector() { return { focus() {} }; } };
  const event = { preventDefault() {}, target: form };
  options.callback('token');
  mode = 'send-error';
  await component.submitContact(event);
  assert.equal(component.state.sendErr, true);
  assert.equal(form.fields.subject, 'Message', 'failure must preserve input');
  assert.equal(posted.get('cf-turnstile-response'), 'token');
  assert.equal(component._contactToken, '');
  options.callback('new-token');
  mode = 'success';
  await component.submitContact(event);
  assert.equal(component.state.sent, true);
  assert.deepEqual(form.fields, {});
  clearTimeout(component._sentT);
}
assert.equal(resets, 4);
const broken = new context.Component();
mode = 'config-error';
await broken.initContact();
assert.equal(broken.state.sendErr, true);
assert.ok(!broken.state.contactConfig, 'configuration failure must not invent an address');
console.log('Contact client checks passed (EN/HE, configuration, preserved input, token reset, success).');
