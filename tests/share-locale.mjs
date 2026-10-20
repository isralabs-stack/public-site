import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { default: worker, localizeHead } = await import('../worker.mjs');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const env = {
  ASSETS: { fetch: async request => new URL(request.url).pathname.endsWith('.jpg')
    ? new Response('jpg', { headers: { 'content-type': 'image/jpeg' } })
    : new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', etag: '"x"' } }) },
};
const get = async url => (await worker.fetch(new Request(url), env)).text();
const meta = (page, attr, key) => page.match(new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`))?.[1];

// English and other requests are served untouched.
assert.equal(await get('https://isralabs.org/'), html);
assert.equal(await get('https://isralabs.org/?lang=en'), html);
assert.equal(await get('https://isralabs.org/assets/img/og-image.jpg?lang=he'), 'jpg');

// Hebrew: share tags, title, description and canonical are Hebrew; the body is unchanged.
const he = await get('https://isralabs.org/?lang=he');
assert.equal(meta(he, 'property', 'og:image'), 'https://isralabs.org/assets/img/og-image-he.jpg');
assert.equal(meta(he, 'name', 'twitter:image'), 'https://isralabs.org/assets/img/og-image-he.jpg');
assert.equal(meta(he, 'property', 'og:url'), 'https://isralabs.org/?lang=he');
assert.equal(meta(he, 'property', 'og:locale'), 'he_IL');
assert.equal(meta(he, 'property', 'og:locale:alternate'), 'en_US');
assert.match(meta(he, 'property', 'og:title'), /^ישראלאבס/);
assert.match(meta(he, 'name', 'twitter:title'), /^ישראלאבס/);
assert.match(meta(he, 'property', 'og:description'), /^מקדמים/);
assert.match(meta(he, 'name', 'description'), /^מקדמים/);
assert.match(meta(he, 'property', 'og:image:alt'), /בונים את עתיד המדע/);
assert.match(he, /<title>ישראלאבס \| /);
assert.match(he, /<link\s+rel="canonical"\s+href="https:\/\/isralabs\.org\/\?lang=he"/);
assert.equal(he.slice(he.indexOf('</head>')), html.slice(html.indexOf('</head>')));
const response = await worker.fetch(new Request('https://isralabs.org/?lang=he'), env);
assert.equal(response.headers.get('etag'), null);

// No head tag: unchanged.
assert.equal(localizeHead('<p>x</p>'), '<p>x</p>');
console.log('share-locale ok');
