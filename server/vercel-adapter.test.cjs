'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { toEvent } = require('./vercel-adapter.cjs');

describe('vercel-adapter toEvent', () => {
  it('normalise /api/health et la query', () => {
    const event = toEvent({
      method: 'GET',
      url: '/api/health?x=1',
      headers: { host: 'ansar.vercel.app', origin: 'https://ansar.vercel.app' },
      body: null,
    });
    assert.equal(event.httpMethod, 'GET');
    assert.equal(event.path, '/api/health');
    assert.equal(event.queryStringParameters.x, '1');
    assert.equal(event.headers.origin, 'https://ansar.vercel.app');
  });

  it('sérialise un body objet', () => {
    const event = toEvent({
      method: 'POST',
      url: '/api/auth/login',
      headers: { host: 'localhost' },
      body: { login: 'a', password: 'b' },
    });
    assert.equal(event.httpMethod, 'POST');
    assert.deepEqual(JSON.parse(event.body), { login: 'a', password: 'b' });
  });

  it('récupère le chemin d’origine après rewrite vers /api', () => {
    const event = toEvent({
      method: 'POST',
      url: '/api',
      headers: {
        host: 'sia-ansar.vercel.app',
        'x-forwarded-uri': '/api/auth/login',
      },
      body: { login: 'a', password: 'b' },
    });
    assert.equal(event.path, '/api/auth/login');
  });
});
