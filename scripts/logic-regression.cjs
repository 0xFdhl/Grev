// Runs the actual source functions with in-memory dependencies. No network,
// credentials, production data, or SQL schema changes are used by these tests.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');

function source(file, symbols, dependencies = {}, before) {
  let text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  if (before) text = text.split(before)[0];
  text = text.replace(/^import .*;\r?$/gm, '').replace(/export default /g, '').replace(/export /g, '');
  return new Function(...Object.keys(dependencies), `${text}\nreturn {${symbols.join(',')}};`)(...Object.values(dependencies));
}
const stock = source('lib/stockCodes.js', ['nextStockNumber', 'createStockCodes']);
const { publicLink } = source('lib/publicLink.js', ['publicLink'], { process: { env: {} } });

function database(initial, cap = 500) {
  const db = { rows: structuredClone(initial), conflicts: 0, inserted: 0, pages: 0 };
  db.from = () => ({
    select() {
      let prefix;
      return {
        like(_field, pattern) { prefix = pattern.slice(0, -1); return this; },
        order() { return this; },
        async range(start, end) {
          db.pages++;
          return { data: db.rows.filter((row) => row.code.startsWith(prefix))
            .sort((a, b) => a.code.localeCompare(b.code)).slice(start, Math.min(end + 1, start + cap)) };
        },
      };
    },
    insert(rows) {
      return { async select() {
        if (rows.some((row) => db.rows.some((existing) => row.code === existing.code))) {
          db.conflicts++;
          return { error: { code: '23505' } };
        }
        db.rows.push(...structuredClone(rows));
        db.inserted += rows.length;
        return { data: rows };
      } };
    },
  });
  return db;
}

function response() {
  return { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(value) { this.statusCode = value; return this; }, json(body) { this.body = body; return this; } };
}

test('QR and NFC always use the permanent production origin', () => {
  assert.equal(publicLink('SVFXXCCY'), 'https://bebetterdevelo.online/SVFXXCCY');
  for (const file of ['pages/admin/index.js', 'components/QRModal.js', 'components/PlaceQRForm.js']) {
    const content = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.match(content, /publicLink\(/);
    assert.doesNotMatch(content, /window\.location\.origin/);
  }
});

test('numbering ignores mixed suffixes and reserves old/trash codes beyond row caps', async () => {
  const rows = Array.from({ length: 1100 }, (_, i) => ({ code: `RV${String(i + 1).padStart(4, '0')}` }));
  rows.push({ code: 'RV99ABCD' }, { code: 'RV9000', deleted_at: '2026-01-01', clicks: 71 });
  const db = database(rows, 37);
  assert.equal(await stock.nextStockNumber(db, 'RV'), 9001);
  assert.ok(db.pages > 2);
  assert.equal(await stock.nextStockNumber(database([{ code: 'RV0001' }, { code: 'RV99ABCD' }]), 'RV'), 2);
});

test('two concurrent batches retry collisions without changing ANY legacy row', async () => {
  const legacy = [
    { id: 'old-active', code: 'RV0001', is_active: true, business_name: 'Bisnis lama', target_url: 'https://example.com/old', clicks: 178, place_id: 'place-old', created_at: '2025-01-01' },
    { id: 'old-trash', code: 'RV0010', is_active: false, deleted_at: '2026-01-01', clicks: 13 },
    { id: 'old-random', code: 'RV99ABCD', is_active: true, clicks: 9 },
  ];
  const db = database(legacy);
  const batches = await Promise.all([stock.createStockCodes(db, 'RV', 25), stock.createStockCodes(db, 'RV', 25)]);
  assert.ok(batches.every((result) => !result.error && result.data.length === 25));
  assert.ok(db.conflicts >= 1, 'test must actually exercise a unique conflict');
  assert.equal(new Set(db.rows.map((row) => row.code)).size, legacy.length + 50);
  assert.deepEqual(db.rows.slice(0, legacy.length), legacy);
  assert.equal(db.rows.at(-1).code, 'RV0060');
});

test('stock failures never replace old codes and oversized numbers are rejected', async () => {
  const db = database([{ code: 'RV0001', clicks: 900 }]);
  db.from = () => ({ select: () => ({ like() { return this; }, order() { return this; }, range: async () => ({ error: new Error('offline') }) }) });
  await assert.rejects(() => stock.createStockCodes(db, 'RV', 2));
  assert.deepEqual(db.rows, [{ code: 'RV0001', clicks: 900 }]);
  const full = database([{ code: 'ABCDEFGHIJ9999999999' }]);
  assert.equal((await stock.createStockCodes(full, 'ABCDEFGHIJ', 1)).error.code, 'STOCK_LIMIT');
});

test('generation API ignores stale client startFrom and uses server allocation', async () => {
  const db = database([{ code: 'RV0050', clicks: 8 }]);
  const { handler } = source('pages/api/links.js', ['handler'], {
    checkAuth: () => true, supabaseAdmin: db, logSecurityEvent: async () => {}, ...stock,
  });
  const res = response();
  await handler({ method: 'POST', body: { prefix: 'RV', count: 2, startFrom: 1 }, query: {} }, res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body.map((row) => row.code), ['RV0051', 'RV0052']);
  assert.deepEqual(db.rows[0], { code: 'RV0050', clicks: 8 });
});

function updateFixture() {
  const row = { id: '11111111-1111-1111-1111-111111111111', code: 'RV0001', is_active: true, target_url: 'https://example.com/old', clicks: 18, business_name: 'Bisnis lama', deleted_at: null };
  const db = { from: () => {
    let updates;
    return { update(fields) { updates = fields; return this; }, eq() { return this; }, is() { return this; }, not() { return this; },
      async select() { Object.assign(row, updates); return { data: [structuredClone(row)] }; } };
  } };
  const { handler } = source('pages/api/links/[id].js', ['handler'], { supabaseAdmin: db, checkAuth: () => true, logSecurityEvent: async () => {} });
  return { row, async call(body, method = 'PUT') { const res = response(); await handler({ method, query: { id: row.id }, body }, res); return res; } };
}

test('empty URL cannot silently leave a code active; invalid updates leave old data unchanged', async () => {
  const f = updateFixture();
  const old = structuredClone(f.row);
  for (const body of [{ target_url: '' }, { target_url: '   ', is_active: true }, { target_url: null }, { target_url: 'javascript:alert(1)' }, { is_active: 'true' }]) {
    assert.equal((await f.call(body)).statusCode, 400);
    assert.deepEqual(f.row, old);
  }
  assert.equal((await f.call({ target_url: '  ', is_active: false })).statusCode, 200);
  assert.equal(f.row.is_active, false);
  assert.equal(f.row.target_url, '');
  assert.equal((await f.call({ target_url: ' https://example.com/new ', is_active: true })).statusCode, 200);
  assert.equal(f.row.target_url, 'https://example.com/new');
});

test('soft-delete and restore preserve code, target, clicks and business', async () => {
  const f = updateFixture();
  const old = structuredClone(f.row);
  assert.equal((await f.call({}, 'DELETE')).statusCode, 200);
  assert.ok(f.row.deleted_at);
  assert.equal((await f.call({ restore: true })).statusCode, 200);
  for (const key of Object.keys(old)) assert.deepEqual(f.row[key], old[key]);
});

function redirectFixture({ data, error, reject, limit = async () => true, rpcReject = false } = {}) {
  const row = data === undefined ? { code: 'RV0001', is_active: true, target_url: 'https://example.com/review' } : data;
  const db = { from: () => ({ select() { return this; }, eq() { return this; }, is() { return this; }, async maybeSingle() { if (reject) throw Error('offline'); return { data: row, error }; } }),
    rpc() { return { async abortSignal() { if (rpcReject) throw Error('counter offline'); return { error: null }; } }; } };
  return source('pages/[code].js', ['getServerSideProps'], { supabaseAdmin: db, rateLimit: limit, getClientIp: () => 'shared-ip', process: { env: {} }, console: { error() {} } }, 'export default function CodePage').getServerSideProps;
}

test('redirect differentiates rate limit, service failure, absent and inactive codes', async () => {
  for (const [options, expectedCode, expectedStatus] of [
    [{ limit: async () => false }, 429, 'limited'], [{ error: { message: 'db offline' } }, 503, 'unavailable'],
    [{ reject: true }, 503, 'unavailable'], [{ data: null }, 404, 'invalid'], [{ data: { is_active: false } }, 404, 'invalid'],
  ]) {
    const res = response(); const result = await redirectFixture(options)({ params: { code: 'RV0001' }, req: {}, res });
    assert.equal(res.statusCode, expectedCode); assert.equal(result.props.status, expectedStatus);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
    if (expectedCode !== 404) assert.ok(res.headers['Retry-After']);
  }
  const result = await redirectFixture({ rpcReject: true })({ params: { code: 'RV0001' }, req: {}, res: response() });
  assert.equal(result.redirect.destination, 'https://example.com/review');
});

test('1000 scans on one shared IP are allowed, while the 1201st is limited', async () => {
  const { rateLimit } = source('lib/rateLimit.js', ['rateLimit'], { process: { env: {} } });
  const run = redirectFixture({ limit: rateLimit });
  for (let i = 0; i < 1200; i++) {
    const result = await run({ params: { code: 'RV0001' }, req: {}, res: response() });
    assert.ok(result.redirect, `request ${i + 1} should redirect`);
  }
  const res = response(); await run({ params: { code: 'RV0001' }, req: {}, res });
  assert.equal(res.statusCode, 429);
});

test('public origin can migrate without changing codes; unsafe configuration fails', () => {
  const link = source('lib/publicLink.js', ['publicLink'], { process: { env: { NEXT_PUBLIC_SITE_URL: 'https://review.example/' } } }).publicLink;
  assert.equal(link('RV0001'), 'https://review.example/RV0001');
  for (const url of ['http://example.com', 'https://example.com/path', 'https://user:pass@example.com', 'https://example.com/?x=1']) {
    assert.throws(() => source('lib/publicLink.js', ['publicLink'], { process: { env: { NEXT_PUBLIC_SITE_URL: url } } }));
  }
});

test('installed Redis SDK receives fresh abort signals, without network', async () => {
  const { Redis } = require('@upstash/redis');
  const original = global.fetch;
  const signals = [];
  global.fetch = async (_url, options) => {
    signals.push(options.signal);
    return new Response(JSON.stringify([{ result: 'PONG' }]), { status: 200 });
  };
  try {
    const { getRedis } = source('lib/rateLimit.js', ['getRedis'], {
      Redis, process: { env: { UPSTASH_REDIS_REST_URL: 'https://test.invalid', UPSTASH_REDIS_REST_TOKEN: 'fake' } },
    });
    await getRedis().ping(); await getRedis().ping();
    assert.equal(signals.length, 2);
    assert.ok(signals.every((signal) => signal instanceof AbortSignal));
    assert.notEqual(signals[0], signals[1]);
  } finally { global.fetch = original; }
});

test('Redis error enters memory fallback instead of unlimited access', async () => {
  let configuration;
  const { rateLimit } = source('lib/rateLimit.js', ['rateLimit'], {
    Redis: class {},
    Ratelimit: class { static slidingWindow() {} constructor(config) { configuration = config; } async limit() { throw Error('offline'); } },
    process: { env: { UPSTASH_REDIS_REST_URL: 'https://test.invalid', UPSTASH_REDIS_REST_TOKEN: 'fake' } },
    console: { error() {} },
  });
  assert.equal(await rateLimit('login:test', 1, 60000), true);
  assert.equal(await rateLimit('login:test', 1, 60000), false);
  assert.equal(configuration.timeout, 0);
});

test('slow counter is aborted and valid redirect still completes', async () => {
  let aborted = false;
  const db = {
    from: () => ({ select() { return this; }, eq() { return this; }, is() { return this; },
      async maybeSingle() { return { data: { code: 'RV0001', is_active: true, target_url: 'https://example.com/review' } }; } }),
    rpc: () => ({ abortSignal(signal) { return new Promise((resolve) => {
      signal.addEventListener('abort', () => { aborted = true; resolve({ error: { message: 'aborted' } }); }, { once: true });
    }); } }),
  };
  const run = source('pages/[code].js', ['getServerSideProps'], {
    supabaseAdmin: db, rateLimit: async () => true, getClientIp: () => 'test', process: { env: {} }, console: { error() {} },
  }, 'export default function CodePage').getServerSideProps;
  const deadline = setTimeout(() => {}, 2000); // Keep Node alive for AbortSignal's unref timer.
  try {
    const result = await run({ params: { code: 'RV0001' }, req: {}, res: response() });
    assert.equal(aborted, true);
    assert.equal(result.redirect.destination, 'https://example.com/review');
  } finally { clearTimeout(deadline); }
});

test('late business response never overwrites the latest selection', async () => {
  const text = fs.readFileSync(path.join(__dirname, '../components/PlaceQRForm.js'), 'utf8');
  const start = text.indexOf('    async function handleSelect(event)');
  const end = text.indexOf("    el.addEventListener('gmp-select'", start);
  const state = {};
  const setters = ['setFetching', 'setMsg', 'setName', 'setPlaceId', 'setReviewLink', 'setLocation', 'setCode', 'setShortLink', 'setQrDataUrl', 'setIsFullscreen'];
  const refs = { selectionRef: { current: 0 }, fetchingRef: { current: false }, savingRef: { current: false }, requestIdRef: { current: null } };
  const run = new Function(...Object.keys(refs), ...setters, text.slice(start, end) + ';return handleSelect;')(
    ...Object.values(refs), ...setters.map((key) => (value) => { state[key] = value; }));
  let finishA, finishB;
  const a = run({ placePrediction: { toPlace: () => ({ displayName: 'A', id: 'A', fetchFields: () => new Promise((r) => { finishA = r; }) }) } });
  const b = run({ placePrediction: { toPlace: () => ({ displayName: 'B', id: 'B', fetchFields: () => new Promise((r) => { finishB = r; }) }) } });
  finishA(); await a;
  assert.equal(refs.fetchingRef.current, true);
  assert.equal(state.setPlaceId, '');
  finishB(); await b;
  assert.equal(state.setPlaceId, 'B');
  assert.equal(refs.fetchingRef.current, false);
  refs.savingRef.current = true;
  await run({ placePrediction: { toPlace() { throw Error('Must not change selection while saving'); } } });
  assert.equal(state.setPlaceId, 'B');
});

test('list API reads beyond row cap in both active and trash views', async () => {
  const rows = Array.from({ length: 1105 }, (_, i) => ({ id: String(i).padStart(5, '0'), created_at: String(i), deleted_at: i % 2 ? '2026-01-01' : null }));
  let fail = false;
  const db = { from: () => {
    let cursor = '', trash = false;
    const q = { select() { return this; }, order() { return this; }, limit() { return this; },
      is() { return this; }, not() { trash = true; return this; }, gt(_key, value) { cursor = value; return this; },
      then(resolve) { resolve(fail ? { error: Error('offline') } : { data: rows.filter(r => r.id > cursor && Boolean(r.deleted_at) === trash).slice(0, 37) }); } };
    return q;
  } };
  const { handler } = source('pages/api/links.js', ['handler'], { checkAuth: () => true, supabaseAdmin: db });
  for (const trash of [false, true]) {
    const res = response();
    await handler({ method: 'GET', query: trash ? { trash: '1' } : {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.length, rows.filter(r => Boolean(r.deleted_at) === trash).length);
    assert.equal(new Set(res.body.map(r => r.id)).size, res.body.length);
  }
  fail = true;
  const res = response(); await handler({ method: 'GET', query: {} }, res);
  assert.equal(res.statusCode, 503);
});

test('same cafe request is idempotent across concurrency and retries, without overwriting', async () => {
  const rows = [];
  const db = { from: () => ({
    insert(row) { return { async select() {
      if (rows.some(r => r.code === row.code)) return { error: { code: '23505' } };
      rows.push({ ...row, id: 'new', deleted_at: null }); return { data: [rows.at(-1)] };
    } }; },
    select() { return { eq(_key, code) { return { async maybeSingle() { return { data: rows.find(r => r.code === code) }; } }; } }; },
  }) };
  const { handler } = source('pages/api/links.js', ['handler'], { checkAuth: () => true, supabaseAdmin: db, ...require('node:crypto') });
  const body = { type: 'cafe', business_name: 'Cafe', place_id: 'place&test', target_url: 'https://untrusted.example', request_id: '12345678-1234-4123-8123-123456789012' };
  async function call(payload) { const res = response(); await handler({ method: 'POST', query: {}, body: payload }, res); return res; }
  const results = await Promise.all([call(body), call(body)]);
  assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 201]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].target_url, 'https://search.google.com/local/writereview?placeid=place%26test');
  const original = structuredClone(rows);
  assert.equal((await call({ ...body, business_name: 'Changed' })).statusCode, 409);
  assert.deepEqual(rows, original);
  assert.equal((await call({ ...body, request_id: 'bad' })).statusCode, 400);
  rows[0].deleted_at = '2026-01-01';
  assert.equal((await call(body)).statusCode, 409);
  assert.equal(rows.length, 1);
});

test('link endpoints reject anonymous access before touching the database', async () => {
  const db = { from() { throw Error('Unauthorized request reached database'); } };
  for (const file of ['pages/api/links.js', 'pages/api/links/[id].js']) {
    const { handler } = source(file, ['handler'], { checkAuth: () => false, supabaseAdmin: db });
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      const res = response(); await handler({ method, query: {}, body: {} }, res);
      assert.equal(res.statusCode, 401);
    }
  }
});

test('signed admin sessions reject altered and expired tokens', () => {
  const crypto = require('node:crypto');
  const session = source('lib/session.js', ['createSessionToken', 'verifySessionToken'], {
    ...crypto, process: { env: { SESSION_SECRET: 'test-only-not-a-production-secret' } },
  });
  const token = session.createSessionToken();
  assert.equal(session.verifySessionToken(token), true);
  assert.equal(session.verifySessionToken('9' + token), false);
  assert.equal(session.verifySessionToken(null), false);
  const expired = String(Date.now() - 1000);
  const signature = crypto.createHmac('sha256', 'test-only-not-a-production-secret').update(expired).digest('hex');
  assert.equal(session.verifySessionToken(`${expired}.${signature}`), false);
});
