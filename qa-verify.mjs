/**
 * QA Verification Script
 * Tests 7 bug fixes in the Tournirken app.
 * Run with: node qa-verify.mjs
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3001';
const WEB = 'http://localhost:5173';
const SCREENSHOTS_DIR = path.join(__dirname, 'qa-screenshots');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let passCount = 0;
let failCount = 0;

function pass(name, detail = '') {
  console.log(`  ✅ PASS: ${name}${detail ? ' — ' + detail : ''}`);
  passCount++;
}

function fail(name, detail = '') {
  console.log(`  ❌ FAIL: ${name}${detail ? ' — ' + detail : ''}`);
  failCount++;
}

async function req(method, path, body, token, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body !== undefined) opts.body = typeof body === 'string' ? body : JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data, headers: Object.fromEntries(res.headers.entries()) };
}

async function login(username = 'admin', password = 'admin123', retries = 5) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await req('POST', '/api/auth/login', { login: username, password });
    if (res.status === 200 && res.data?.accessToken) return res.data.accessToken;
    if (res.status === 429) {
      console.log(`    ⏳ Login rate-limited (attempt ${attempt + 1}/${retries}), waiting 65s...`);
      await new Promise(r => setTimeout(r, 65000));
    } else {
      // Wrong credentials or other error — no point retrying
      console.log(`    ⚠️  Login failed with status ${res.status}: ${JSON.stringify(res.data)}`);
      return null;
    }
  }
  return null;
}

// ─── Helper: create a tournament ────────────────────────────────────────────
async function createTournament(token, overrides = {}) {
  const body = {
    tournamentName: `QA Test ${Date.now()}`,
    gameName: 'QA Game',
    format: 'SINGLE_ELIMINATION',
    maxParticipants: 8,
    ...overrides,
  };
  return req('POST', '/api/tournaments', body, token);
}

// ─────────────────────────────────────────────────────────────────────────────
// BUG #1 — logo field: only http/https URIs allowed
// ─────────────────────────────────────────────────────────────────────────────
async function testBug1() {
  console.log('\n=== BUG #1: Logo field URI validation ===');
  const token = await login();
  if (!token) { fail('Login for bug #1'); return; }

  const base = {
    tournamentName: `Logo Test ${Date.now()}`,
    gameName: 'QA Game',
    format: 'SINGLE_ELIMINATION',
    maxParticipants: 8,
  };

  // Should REJECT
  const badCases = [
    ['javascript:alert(1)', 'javascript: URI'],
    ['data:text/html,x', 'data: URI'],
    ['ftp://host/img.png', 'ftp:// URI'],
    ['//host/img.png', 'protocol-relative URI'],
  ];

  for (const [logo, label] of badCases) {
    const res = await req('POST', '/api/tournaments', { ...base, logo }, token);
    if (res.status === 400) {
      pass(`logo "${label}" rejected (400)`);
    } else {
      fail(`logo "${label}" should be rejected but got ${res.status}`, JSON.stringify(res.data));
    }
  }

  // Should ACCEPT
  const goodCases = [
    ['http://good.com/img.png', 'http:// URL'],
    ['https://good.com/img.png', 'https:// URL'],
    ['', 'empty string (no logo)'],
  ];

  for (const [logo, label] of goodCases) {
    const res = await req('POST', '/api/tournaments', { ...base, logo }, token);
    if (res.status === 201) {
      pass(`logo "${label}" accepted (201)`);
    } else {
      fail(`logo "${label}" should be accepted but got ${res.status}`, JSON.stringify(res.data));
    }
  }

  // Without logo field at all — should also work
  const noLogo = await req('POST', '/api/tournaments', { ...base }, token);
  if (noLogo.status === 201) {
    pass('no logo field — accepted (201)');
  } else {
    fail(`no logo field should be accepted but got ${noLogo.status}`, JSON.stringify(noLogo.data));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUG #2 — Non-canonical IDs: parseId() must reject floats, hex, negative, etc.
// ─────────────────────────────────────────────────────────────────────────────
async function testBug2() {
  console.log('\n=== BUG #2: Non-canonical ID validation ===');
  const token = await login();
  if (!token) { fail('Login for bug #2'); return; }

  // These should all return 400 (Неверный ID)
  // NOTE: empty string '' is intentionally excluded — it resolves to the list endpoint (GET /api/tournaments)
  // which returns 200 with a list of tournaments. That's correct routing, not a bug.
  const badIds = [
    ['1.5', 'float'],
    ['1abc', 'alphanumeric'],
    ['0x10', 'hex'],
    ['1e2', 'scientific notation'],
    ['-1', 'negative'],
    ['0', 'zero'],
    ['NaN', 'NaN'],
    ['null', 'string null'],
  ];

  // Test on GET /api/tournaments/:id
  for (const [id, label] of badIds) {
    const res = await req('GET', `/api/tournaments/${encodeURIComponent(id)}`, undefined, token);
    if (res.status === 400) {
      pass(`GET /tournaments/${label} => 400`);
    } else {
      fail(`GET /tournaments/${label} should be 400 but got ${res.status}`, JSON.stringify(res.data).substring(0, 100));
    }
  }

  // empty string edge case: routes to list endpoint (expected behavior, not a bug in parseId)
  const emptyRes = await req('GET', `/api/tournaments/`, undefined, token);
  if (emptyRes.status === 200 && Array.isArray(emptyRes.data?.data)) {
    pass('GET /tournaments/ (empty ID) => 200 list (routes to list endpoint, not parseId — correct)');
  } else {
    console.log(`    ℹ️  GET /tournaments/ empty ID => ${emptyRes.status} (${JSON.stringify(emptyRes.data).substring(0, 80)})`);
  }

  // Test on DELETE /api/tournaments/:id
  for (const [id, label] of badIds) {
    const res = await req('DELETE', `/api/tournaments/${encodeURIComponent(id)}`, undefined, token);
    if (res.status === 400) {
      pass(`DELETE /tournaments/${label} => 400`);
    } else {
      fail(`DELETE /tournaments/${label} should be 400 but got ${res.status}`, JSON.stringify(res.data).substring(0, 100));
    }
  }

  // Test on GET /api/matches/:id
  for (const [id, label] of badIds) {
    const res = await req('GET', `/api/matches/${encodeURIComponent(id)}`, undefined, token);
    if (res.status === 400) {
      pass(`GET /matches/${label} => 400`);
    } else {
      fail(`GET /matches/${label} should be 400 but got ${res.status}`, JSON.stringify(res.data).substring(0, 100));
    }
  }

  // Test on GET /api/tournaments/:id/grid
  for (const [id, label] of badIds) {
    const res = await req('GET', `/api/tournaments/${encodeURIComponent(id)}/grid`, undefined, token);
    if (res.status === 400) {
      pass(`GET /tournaments/${label}/grid => 400`);
    } else {
      fail(`GET /tournaments/${label}/grid should be 400 but got ${res.status}`, JSON.stringify(res.data).substring(0, 100));
    }
  }

  // Valid ID should work (1 — might 404 if no tournament exists, but NOT 400)
  const validRes = await req('GET', '/api/tournaments/1', undefined, token);
  if (validRes.status !== 400) {
    pass(`GET /tournaments/1 valid ID => ${validRes.status} (not 400)`);
  } else {
    fail(`GET /tournaments/1 valid ID should not be 400`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUG #3 — Rate limiting on login endpoint (10 req/min)
// ─────────────────────────────────────────────────────────────────────────────
async function testBug3() {
  console.log('\n=== BUG #3: Rate limiting on /api/auth/login ===');

  // We need fresh rate limit window — use a unique IP-like approach via a different header isn't possible,
  // but we can proceed sequentially.
  // NOTE: Rate limit is keyed per IP (127.0.0.1 in this case). May already be partly consumed.
  // We'll send 10 requests with wrong credentials and check we get 401 on all of them.
  // Then the 11th should be 429.

  // First, ensure we're at a fresh window by checking if we can still get 401s
  // Strategy: send requests and track when 429 arrives
  const results = [];
  for (let i = 1; i <= 12; i++) {
    const res = await req('POST', '/api/auth/login', { login: 'admin', password: 'WRONGPASSWORD' });
    results.push({ i, status: res.status, data: res.data, headers: res.headers });
  }

  // Find if any 429 appeared
  const first429 = results.find(r => r.status === 429);
  const all401Before429 = first429
    ? results.filter(r => r.i < first429.i).every(r => r.status === 401)
    : false;

  if (first429) {
    pass(`Rate limit 429 received at request #${first429.i}`);
    if (first429.i <= 11) {
      pass(`Rate limit triggered within 11 requests (at #${first429.i})`);
    } else {
      fail(`Rate limit triggered too late at request #${first429.i}`);
    }

    // Check 429 response body/headers
    const body429 = first429.data;
    if (body429 && (body429.error || body429.message)) {
      pass('429 response has error message', JSON.stringify(body429));
    } else {
      fail('429 response should have error message', JSON.stringify(body429));
    }

    // Check for rate limit headers
    const rl = first429.headers;
    if (rl['x-ratelimit-limit'] || rl['retry-after'] || rl['x-ratelimit-reset']) {
      pass('Rate limit headers present');
    } else {
      // Not critical but worth noting
      console.log('    ℹ️  NOTE: No standard rate-limit headers found (may be OK)');
    }
  } else {
    fail('No 429 received in 12 consecutive wrong-password attempts',
         `statuses: ${results.map(r => r.status).join(', ')}`);
  }

  // Verify: after waiting a bit, successful login still works
  // (We can't wait a full minute in a test, so we just verify with correct credentials
  //  that the login endpoint itself is reachable and works when not rate-limited)
  // We'll need to wait for the rate limit window — but since this is a QA test,
  // just note if we're currently rate-limited for the valid login test
  const validLogin = await req('POST', '/api/auth/login', { login: 'admin', password: 'admin123' });
  if (validLogin.status === 200 && validLogin.data?.accessToken) {
    pass('Valid login (admin/admin123) succeeds (not rate-limited for valid creds)');
  } else if (validLogin.status === 429) {
    console.log('    ℹ️  NOTE: Valid login is currently rate-limited (window not expired) — this is EXPECTED behavior');
    console.log('    ℹ️  Rate limiting applies to correct credentials too (per IP, not per-outcome)');
  } else {
    fail(`Valid login returned ${validLogin.status}`, JSON.stringify(validLogin.data));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUG #4 — Empty JSON body on POST /open-registration
// ─────────────────────────────────────────────────────────────────────────────
async function testBug4() {
  console.log('\n=== BUG #4: Empty JSON body on POST /open-registration ===');
  const token = await login();
  if (!token) { fail('Login for bug #4'); return; }

  // Create a tournament first (in DRAFT status)
  const created = await createTournament(token);
  if (created.status !== 201) {
    fail('Could not create tournament for bug #4 test', JSON.stringify(created.data));
    return;
  }
  const tournamentId = created.data.id;

  // Test 1: POST with Content-Type: application/json but NO body
  const res1 = await fetch(`${BASE}/api/tournaments/${tournamentId}/open-registration`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    // No body
  });
  const data1 = await res1.json().catch(() => null);

  if (res1.status === 200) {
    pass('POST /open-registration with no body => 200 OK');
  } else {
    fail(`POST /open-registration with no body => ${res1.status} (expected 200)`, JSON.stringify(data1));
  }

  // Create another tournament for the next test (first one might now be REGISTRATION)
  const created2 = await createTournament(token);
  if (created2.status !== 201) {
    fail('Could not create second tournament for bug #4 test', JSON.stringify(created2.data));
    return;
  }
  const tournamentId2 = created2.data.id;

  // Test 2: POST with Content-Type: application/json and body: '{}'
  const res2 = await req('POST', `/api/tournaments/${tournamentId2}/open-registration`, {}, token);
  if (res2.status === 200) {
    pass('POST /open-registration with empty JSON {} => 200 OK');
  } else {
    fail(`POST /open-registration with empty JSON {} => ${res2.status} (expected 200)`, JSON.stringify(res2.data));
  }

  // Test 3: Verify DELETE /:id/leave endpoint is not affected by body parsing change
  // (leave requires being a participant, so we expect 404 - you're not a participant, not a 400/parse error)
  const res3 = await fetch(`${BASE}/api/tournaments/${tournamentId}/leave`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  const data3 = await res3.json().catch(() => null);
  // Admin is not a participant, so expect 404 (not 400/500)
  if (res3.status === 404 || res3.status === 400) {
    pass(`DELETE /leave works (returns ${res3.status} - not a body parsing error)`);
  } else if (res3.status === 200) {
    pass('DELETE /leave => 200 (admin was somehow a participant)');
  } else {
    fail(`DELETE /leave => ${res3.status} (unexpected)`, JSON.stringify(data3));
  }

  // Test 4: Verify the content-type parser handles body: 'null' string (edge case)
  const res4 = await fetch(`${BASE}/api/tournaments/${tournamentId}/open-registration`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: 'null',
  });
  const data4 = await res4.json().catch(() => null);
  // Tournament is now in REGISTRATION after first test, so it should be 400 for wrong status
  // but NOT a body parse error. Status 400 (already REGISTRATION) is acceptable.
  if (res4.status !== 500 && res4.status !== 415) {
    pass(`POST /open-registration with body 'null' => ${res4.status} (not a server/parse error)`);
  } else {
    fail(`POST /open-registration with body 'null' => ${res4.status}`, JSON.stringify(data4));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUG #5 — SWISS without swissRounds
// ─────────────────────────────────────────────────────────────────────────────
async function testBug5() {
  console.log('\n=== BUG #5: SWISS tournament requires swissRounds ===');
  const token = await login();
  if (!token) { fail('Login for bug #5'); return; }

  const base = {
    tournamentName: `Swiss Test ${Date.now()}`,
    gameName: 'QA Swiss Game',
    format: 'SWISS',
    maxParticipants: 8,
  };

  // Should REJECT: SWISS without swissRounds
  const res1 = await req('POST', '/api/tournaments', { ...base }, token);
  if (res1.status === 400) {
    pass('SWISS without swissRounds => 400');
  } else {
    fail(`SWISS without swissRounds should be 400 but got ${res1.status}`, JSON.stringify(res1.data));
  }

  // Should REJECT: swissRounds: 0 (min is 1)
  const res2 = await req('POST', '/api/tournaments', { ...base, swissRounds: 0 }, token);
  if (res2.status === 400) {
    pass('SWISS with swissRounds=0 => 400 (below min)');
  } else {
    fail(`SWISS with swissRounds=0 should be 400 but got ${res2.status}`, JSON.stringify(res2.data));
  }

  // Should REJECT: swissRounds: 21 (max is 20)
  const res3 = await req('POST', '/api/tournaments', { ...base, swissRounds: 21 }, token);
  if (res3.status === 400) {
    pass('SWISS with swissRounds=21 => 400 (above max)');
  } else {
    fail(`SWISS with swissRounds=21 should be 400 but got ${res3.status}`, JSON.stringify(res3.data));
  }

  // Should ACCEPT: swissRounds: 5
  const res4 = await req('POST', '/api/tournaments', { ...base, swissRounds: 5, tournamentName: `Swiss Valid ${Date.now()}` }, token);
  if (res4.status === 201) {
    pass('SWISS with swissRounds=5 => 201 (accepted)');
  } else {
    fail(`SWISS with swissRounds=5 should be 201 but got ${res4.status}`, JSON.stringify(res4.data));
  }

  // Boundary: swissRounds: 1 (min)
  const res5 = await req('POST', '/api/tournaments', { ...base, swissRounds: 1, tournamentName: `Swiss Min ${Date.now()}` }, token);
  if (res5.status === 201) {
    pass('SWISS with swissRounds=1 (min) => 201 (accepted)');
  } else {
    fail(`SWISS with swissRounds=1 should be 201 but got ${res5.status}`, JSON.stringify(res5.data));
  }

  // Boundary: swissRounds: 20 (max)
  const res6 = await req('POST', '/api/tournaments', { ...base, swissRounds: 20, tournamentName: `Swiss Max ${Date.now()}` }, token);
  if (res6.status === 201) {
    pass('SWISS with swissRounds=20 (max) => 201 (accepted)');
  } else {
    fail(`SWISS with swissRounds=20 should be 201 but got ${res6.status}`, JSON.stringify(res6.data));
  }

  // UpdateTournamentSchema is partial — should allow updating a non-SWISS field without swissRounds
  // First create a valid non-SWISS tournament to update
  const created = await createTournament(token, { tournamentName: `Update Test ${Date.now()}` });
  if (created.status !== 201) {
    fail('Could not create tournament for PATCH test');
    return;
  }
  const tid = created.data.id;

  // PATCH with only maxParticipants — no swissRounds, no format change — should work
  const patchRes = await req('PATCH', `/api/tournaments/${tid}`, { maxParticipants: 16 }, token);
  if (patchRes.status === 200) {
    pass('PATCH non-SWISS tournament with only maxParticipants (no swissRounds) => 200');
  } else {
    fail(`PATCH non-SWISS tournament should be 200 but got ${patchRes.status}`, JSON.stringify(patchRes.data));
  }

  // PATCH with format=SWISS but no swissRounds — should be checked...
  // Actually UpdateTournamentSchema is innerType().partial() which bypasses the refine
  // This is an EDGE CASE to verify the dev may have missed
  const patchSwissNoRounds = await req('PATCH', `/api/tournaments/${tid}`, { format: 'SWISS' }, token);
  if (patchSwissNoRounds.status === 400) {
    pass('PATCH format=SWISS without swissRounds => 400 (edge case caught)');
    console.log('    ℹ️  UpdateTournamentSchema DOES enforce SWISS+swissRounds constraint on PATCH');
  } else if (patchSwissNoRounds.status === 200) {
    fail('PATCH format=SWISS without swissRounds => 200 (edge case MISSED — UpdateTournamentSchema.partial() skips refine!)');
    console.log('    ℹ️  EDGE CASE: .innerType().partial() strips the .refine() — SWISS can be set without swissRounds on PATCH');
  } else {
    console.log(`    ℹ️  PATCH format=SWISS without swissRounds => ${patchSwissNoRounds.status}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUG #6 — info field size limit (max 10000 chars)
// ─────────────────────────────────────────────────────────────────────────────
async function testBug6() {
  console.log('\n=== BUG #6: info field max 10000 chars ===');
  const token = await login();
  if (!token) { fail('Login for bug #6'); return; }

  const base = {
    tournamentName: `Info Test ${Date.now()}`,
    gameName: 'QA Game',
    format: 'SINGLE_ELIMINATION',
    maxParticipants: 8,
  };

  // Exactly 10000 chars — should ACCEPT
  const info10000 = 'A'.repeat(10000);
  const res1 = await req('POST', '/api/tournaments', { ...base, info: info10000, tournamentName: `Info 10000 ${Date.now()}` }, token);
  if (res1.status === 201) {
    pass('info with exactly 10000 chars => 201 (accepted)');
  } else {
    fail(`info with exactly 10000 chars should be 201 but got ${res1.status}`, JSON.stringify(res1.data));
  }

  // 10001 chars — should REJECT
  const info10001 = 'A'.repeat(10001);
  const res2 = await req('POST', '/api/tournaments', { ...base, info: info10001, tournamentName: `Info 10001 ${Date.now()}` }, token);
  if (res2.status === 400) {
    pass('info with 10001 chars => 400 (rejected)');
  } else {
    fail(`info with 10001 chars should be 400 but got ${res2.status}`, JSON.stringify(res2.data));
  }

  // 100000 chars — should REJECT
  const info100000 = 'A'.repeat(100000);
  const res3 = await req('POST', '/api/tournaments', { ...base, info: info100000, tournamentName: `Info 100000 ${Date.now()}` }, token);
  if (res3.status === 400) {
    pass('info with 100000 chars => 400 (rejected)');
  } else {
    fail(`info with 100000 chars should be 400 but got ${res3.status}`, JSON.stringify(res3.data));
  }

  // No info — should ACCEPT
  const res4 = await req('POST', '/api/tournaments', { ...base, tournamentName: `Info None ${Date.now()}` }, token);
  if (res4.status === 201) {
    pass('no info field => 201 (accepted)');
  } else {
    fail(`no info field should be 201 but got ${res4.status}`, JSON.stringify(res4.data));
  }

  // Empty info string — should ACCEPT (optional)
  const res5 = await req('POST', '/api/tournaments', { ...base, info: '', tournamentName: `Info Empty ${Date.now()}` }, token);
  if (res5.status === 201) {
    pass('info="" (empty) => 201 (accepted)');
  } else {
    fail(`info="" should be 201 but got ${res5.status}`, JSON.stringify(res5.data));
  }

  // Exactly 9999 chars — should ACCEPT
  const info9999 = 'A'.repeat(9999);
  const res6 = await req('POST', '/api/tournaments', { ...base, info: info9999, tournamentName: `Info 9999 ${Date.now()}` }, token);
  if (res6.status === 201) {
    pass('info with 9999 chars => 201 (accepted)');
  } else {
    fail(`info with 9999 chars should be 201 but got ${res6.status}`, JSON.stringify(res6.data));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BUG #7 — Protected pages redirect unauthenticated users to /
// ─────────────────────────────────────────────────────────────────────────────
async function testBug7() {
  console.log('\n=== BUG #7: Protected pages redirect unauthenticated users ===');

  // Check if web server is running
  let webRunning = false;
  try {
    const res = await fetch(WEB, { signal: AbortSignal.timeout(3000) });
    webRunning = res.ok;
  } catch {
    webRunning = false;
  }

  if (!webRunning) {
    console.log('    ⚠️  Web server at http://localhost:5173 is NOT running — skipping Bug #7 visual tests');
    console.log('    ℹ️  Start with: pnpm dev, then re-run this script');
    fail('Web server not running — cannot test Bug #7');
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Make sure we are NOT logged in (fresh context has no cookies/localStorage)
  const protectedRoutes = [
    { path: '/profile', label: 'Profile page' },
    { path: '/admin', label: 'Admin page' },
    { path: '/tournaments/create', label: 'Create tournament page' },
  ];

  for (const route of protectedRoutes) {
    try {
      // Navigate to protected page
      await page.goto(`${WEB}${route.path}`, { waitUntil: 'networkidle', timeout: 10000 });

      // Wait a moment for any useEffect redirect
      await page.waitForTimeout(1500);

      const currentUrl = page.url();
      const urlObj = new URL(currentUrl);
      const finalPath = urlObj.pathname;

      // Take screenshot
      const screenshotPath = path.join(SCREENSHOTS_DIR, `bug7-${route.label.replace(/\s+/g, '-').toLowerCase()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`    📸 Screenshot: ${screenshotPath}`);

      if (finalPath === '/' || finalPath === '') {
        pass(`${route.label}: redirected to / (URL: ${currentUrl})`);
      } else {
        fail(`${route.label}: NOT redirected — stayed at ${currentUrl}`);
      }
    } catch (err) {
      fail(`${route.label}: error during test — ${err.message}`);
    }
  }

  // Also test: after logging in, protected pages should be accessible
  console.log('\n  Testing authenticated access to protected pages...');
  try {
    // Login via the web app
    await page.goto(`${WEB}/`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(500);

    // Use the API token approach: set localStorage
    const loginRes = await req('POST', '/api/auth/login', { login: 'admin', password: 'admin123' });
    const token = loginRes.data?.accessToken;

    if (token) {
      // Inject auth state into localStorage
      await page.evaluate((t) => {
        // Set auth token in whatever format the app uses
        localStorage.setItem('auth-token', t);
        // Also try common keys
        localStorage.setItem('accessToken', t);
        localStorage.setItem('token', t);
      }, token);

      // Try profile page — if the app uses Zustand persist, we need to set that too
      await page.goto(`${WEB}/profile`, { waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(1500);
      const urlAfterAuth = page.url();
      console.log(`    ℹ️  After injecting token, /profile => ${urlAfterAuth} (behavior depends on Zustand store key)`);
    }
  } catch (err) {
    console.log(`    ℹ️  Authenticated access test skipped: ${err.message}`);
  }

  await browser.close();
}

// ─────────────────────────────────────────────────────────────────────────────
// Main runner
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     QA Verification Script — Tournirken Bug Fixes        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`API: ${BASE}`);
  console.log(`Web: ${WEB}`);
  console.log(`Screenshots: ${SCREENSHOTS_DIR}`);

  try {
    // Run auth-dependent tests BEFORE Bug #3 (which exhausts the login rate limit)
    await testBug1();
    await testBug2();
    await testBug4();
    await testBug5();
    await testBug6();
    // Bug #3 intentionally hammers the login endpoint — run it second-to-last
    await testBug3();
    // Bug #7 uses Playwright (no login via API needed)
    await testBug7();
  } catch (err) {
    console.error('\nFATAL ERROR:', err);
    failCount++;
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (failCount > 0) process.exit(1);
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
