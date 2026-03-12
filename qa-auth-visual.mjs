/**
 * QA Authenticated Visual Test
 * Properly logs in via UI (waits for state), then tests authenticated flows.
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3001';
const WEB = 'http://localhost:5173';
const SS_DIR = path.join(__dirname, 'qa-screenshots', 'single-elim');
if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });

let bugs = [];
let bugCount = 0;
let passCount = 0;
let failCount = 0;

function pass(name, detail = '') {
  console.log(`  PASS: ${name}${detail ? ' — ' + detail : ''}`);
  passCount++;
}

function fail(name, detail = '') {
  console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`);
  failCount++;
}

function bug(title, steps, expected, actual, severity, screenshotPath = null) {
  bugCount++;
  const b = { num: bugCount, title, steps, expected, actual, severity, screenshotPath };
  bugs.push(b);
  console.log(`\n  BUG #${bugCount}: ${title} [${severity.toUpperCase()}]`);
  console.log(`     Steps: ${b.steps}`);
  console.log(`     Expected: ${b.expected}`);
  console.log(`     Actual: ${b.actual}`);
  if (b.screenshotPath) console.log(`     Screenshot: ${b.screenshotPath}`);
}

async function req(method, endpoint, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${endpoint}`, opts);
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

async function screenshot(page, name) {
  const p = path.join(SS_DIR, `auth-${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`    Screenshot: ${p}`);
  return p;
}

// Properly log in and wait for the navbar to show the user is logged in
async function loginAndWait(page) {
  await page.goto(WEB, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(500);

  // Check for login form
  const loginInput = page.locator('input[placeholder*="логин"], input[placeholder*="email"], input[placeholder*="Логин"]').first();
  if (!await loginInput.isVisible({ timeout: 3000 })) {
    console.log('    Login form not visible, may already be logged in');
    return;
  }

  await loginInput.fill('admin');
  await page.locator('input[type="password"]').first().fill('admin123');
  await page.locator('button[type="submit"]').filter({ hasText: /^Войти$/ }).click();

  // Wait for the login form to disappear (meaning we're now logged in)
  // The form shows "Войти" button — after login, the sidebar should change
  try {
    await page.waitForFunction(() => {
      // After login, the Zustand user state is set — sidebar login form should be gone
      // or the "Войти" nav button replaced
      const inputs = document.querySelectorAll('input[type="password"]');
      return inputs.length === 0;
    }, { timeout: 5000 });
    console.log('    Login successful (password input gone)');
  } catch {
    console.log('    Login state unclear after 5s');
  }

  await page.waitForTimeout(1000);
}

async function main() {
  console.log('=== Authenticated Visual QA ===\n');

  // Get admin token for API calls
  const loginRes = await req('POST', '/api/auth/login', { login: 'admin', password: 'admin123' });
  const adminToken = loginRes.data?.accessToken;
  if (!adminToken) { console.error('API login failed'); process.exit(1); }

  // Get a live active tournament ID (from 8-player test earlier)
  const tListRes = await req('GET', '/api/tournaments?status=ACTIVE&limit=3', undefined, adminToken);
  const activeTournaments = tListRes.data?.data || [];
  console.log(`Active tournaments: ${activeTournaments.map(t => `${t.id}:${t.name.substring(0,20)}`).join(', ')}`);

  // Find a 4-player active SE tournament
  let activeSETournament = activeTournaments.find(t => t.format === 'SINGLE_ELIMINATION' && t.participantCount >= 4);
  if (!activeSETournament) {
    // Create one
    const t = await req('POST', '/api/tournaments', {
      tournamentName: `AuthQA4P ${Date.now()}`,
      gameName: 'TestGame',
      format: 'SINGLE_ELIMINATION',
      maxParticipants: 4,
    }, adminToken);
    const tid = t.data.id;
    await req('POST', `/api/tournaments/${tid}/open-registration`, {}, adminToken);
    for (let i = 0; i < 4; i++) {
      const ts = Date.now();
      const reg = await req('POST', '/api/auth/register', { login: `aq${ts}u${i}`, email: `aq${ts}u${i}@test.com`, password: 'test1234' });
      await req('POST', `/api/tournaments/${tid}/join`, {}, reg.data?.accessToken);
    }
    await req('POST', `/api/tournaments/${tid}/grid/finalize`, { gridJson: '{}', participantAssignments: [] }, adminToken);
    const tFull = await req('GET', `/api/tournaments/${tid}`, undefined, adminToken);
    activeSETournament = tFull.data;
  }
  console.log(`Using tournament: ID=${activeSETournament.id}, name=${activeSETournament.name}`);

  // Get an active match for this tournament
  const matchesRes = await req('GET', `/api/tournaments/${activeSETournament.id}/matches`, undefined, adminToken);
  const allMatches = matchesRes.data || [];
  const activeMatch = allMatches.find(m => !m.isFinished && !m.isBye && m.player1Id && m.player2Id);
  console.log(`Active match: ${activeMatch ? `id=${activeMatch.id}` : 'none'}`);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // ─── STEP 1: Login ─────────────────────────────────────────────────────────
    console.log('\n=== Logging in via UI ===');
    await loginAndWait(page);
    let ssPath = await screenshot(page, '01-post-login');

    // Verify actual login state by checking for admin-specific UI
    const bodyText = await page.textContent('body');
    const hasCreateBtn = bodyText?.includes('Создать турнир') || bodyText?.includes('создать');
    const noLoginForm = !bodyText?.includes('Войти / Зарегистроваться') && !(await page.locator('input[type="password"]').isVisible());
    console.log(`    Has "Создать турнир": ${hasCreateBtn}`);
    console.log(`    Login form gone: ${noLoginForm}`);

    if (noLoginForm) {
      pass('Login successful — login form disappeared');
    } else {
      console.log('    WARNING: Login form still visible. Session may not persist between page navigations.');
      console.log('    NOTE: accessToken not persisted in Zustand — only user. This means after login, token exists in memory only.');
    }

    // ─── STEP 2: Navigate to tournament page ───────────────────────────────────
    console.log('\n=== Tournament page (as logged-in user) ===');
    await page.goto(`${WEB}/tournaments/${activeSETournament.id}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);
    ssPath = await screenshot(page, '02-tournament-page-authed');

    const tournamentText = await page.textContent('body');
    const isLoggedInOnTournPage = !tournamentText?.includes('Войти / Зарегистрироваться') || !await page.locator('input[type="password"]').isVisible();
    console.log(`    Logged in on tournament page: ${isLoggedInOnTournPage}`);
    console.log(`    NOTE: accessToken is in-memory only (not persisted). After page navigation from same session, it should still work.`);

    // Check for organizer controls on tournament page
    const hasOrganizerBtn = tournamentText?.includes('Управление') || tournamentText?.includes('Организатор') || tournamentText?.includes('Запустить');
    const hasEditBtn = tournamentText?.includes('Редактировать') || tournamentText?.includes('редактировать');
    console.log(`    Has organizer/manage button: ${hasOrganizerBtn}`);
    console.log(`    Has edit button: ${hasEditBtn}`);

    // ─── STEP 3: Open bracket ─────────────────────────────────────────────────
    console.log('\n=== Bracket as logged-in user ===');
    const gridBtn = page.locator('button, a').filter({ hasText: 'Турнирная сетка' }).first();
    if (await gridBtn.isVisible()) {
      await gridBtn.click();
      await page.waitForTimeout(2000);
      ssPath = await screenshot(page, '03-bracket-authed');
      const bracketText = await page.textContent('body');

      // Check bracket page label
      const title = await page.locator('h1, [class*="title"]').first().textContent().catch(() => '');
      console.log(`    Bracket page title: "${title}"`);
      console.log(`    URL: ${page.url()}`);

      // Check for score numbers (finished matches show scores)
      const hasScores = bracketText?.match(/\d+ : \d+/) || bracketText?.match(/\d+\s*:\s*\d+/);
      console.log(`    Has score display: ${!!hasScores}`);

      // Check if bracket is interactive (click a match node)
      const matchNodes = await page.locator('[class*="react-flow"] [class*="node"], .react-flow__node').all();
      console.log(`    React Flow match nodes: ${matchNodes.length}`);

      if (matchNodes.length > 0) {
        // Click first non-bye match node
        for (const node of matchNodes) {
          const nodeText = await node.textContent().catch(() => '');
          if (!nodeText.includes('BYE') && nodeText.trim().length > 3) {
            await node.click();
            await page.waitForTimeout(1000);
            break;
          }
        }
        ssPath = await screenshot(page, '04-after-match-click');
        const afterClickText = await page.textContent('body');
        const openedModal = afterClickText !== bracketText;
        console.log(`    Page changed after match click: ${openedModal}`);
      }
    }

    // ─── STEP 4: Match result entry page ──────────────────────────────────────
    console.log('\n=== Match page as organizer ===');
    if (activeMatch) {
      await page.goto(`${WEB}/matches/${activeMatch.id}`, { waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(1500);
      ssPath = await screenshot(page, '05-match-page-authed');

      const matchText = await page.textContent('body');
      const hasResultForm = matchText?.includes('Введите результат') || matchText?.includes('счёт') || matchText?.includes('Сохранить');
      const hasScoreInputs = await page.locator('input[type="number"]').count();
      console.log(`    Result form visible: ${hasResultForm}`);
      console.log(`    Score inputs: ${hasScoreInputs}`);

      if (hasResultForm || hasScoreInputs > 0) {
        pass('Match page shows result entry form for organizer');

        // Try to enter a result
        const inputs = await page.locator('input[type="number"]').all();
        if (inputs.length >= 2) {
          await inputs[0].fill('3');
          await inputs[1].fill('1');

          // Enable "final result" switch
          const finalSwitch = page.locator('[role="switch"]').first();
          if (await finalSwitch.isVisible()) {
            const isChecked = await finalSwitch.getAttribute('data-state');
            if (isChecked !== 'checked') await finalSwitch.click();
          }

          ssPath = await screenshot(page, '06-result-filled');

          const saveBtn = page.locator('button').filter({ hasText: /Сохранить|сохранить|save/i }).first();
          if (await saveBtn.isVisible()) {
            await saveBtn.click();
            await page.waitForTimeout(2000);
            ssPath = await screenshot(page, '07-after-result-save');
            const afterSaveText = await page.textContent('body');
            const showsScore = afterSaveText?.includes('3') && afterSaveText?.includes('1');
            const showsFinished = afterSaveText?.includes('Завершён');
            console.log(`    After save: shows score: ${showsScore}, shows Завершён: ${showsFinished}`);
            if (showsFinished) {
              pass('Match result saved successfully — match shows Завершён');
            } else if (showsScore) {
              pass('Match result saved — score displayed');
            } else {
              fail('Match result save unclear outcome');
            }
          }
        }
      } else {
        // The result form is NOT shown even for admin — this is the key issue
        bug(
          'Match result form not visible for admin/organizer on match page',
          '1. Login as admin. 2. Navigate to /matches/{id} for an active match.',
          'Result entry form (score inputs, Save button) visible for organizer',
          'No result form or score inputs found — form requires accessToken in store, but token is not persisted',
          'high',
          ssPath
        );
        console.log(`    Body text preview: ${matchText?.substring(0, 300)}`);
      }
    }

    // ─── STEP 5: Create tournament page ───────────────────────────────────────
    console.log('\n=== Create tournament page (logged in) ===');
    // Must navigate from same session (accessToken in memory)
    await page.goto(`${WEB}/tournaments/create`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1500);
    ssPath = await screenshot(page, '08-create-tournament-authed');
    const createUrl = page.url();
    const createText = await page.textContent('body');
    console.log(`    URL: ${createUrl}`);
    console.log(`    Has form fields: ${createText?.includes('Название') || createText?.includes('Формат')}`);

    if (createUrl.includes('/tournaments/create')) {
      pass('Create tournament page accessible');
      const hasFormatSelect = createText?.includes('Формат') || createText?.includes('Олимпийская');
      console.log(`    Has format selector: ${hasFormatSelect}`);
      if (hasFormatSelect) {
        pass('Create tournament page has format selector');
      } else {
        fail('Create tournament page missing format selector');
      }
    } else {
      bug(
        'Create tournament page redirects away even when session is active',
        '1. Login. 2. In same page session, navigate to /tournaments/create.',
        'Create tournament form is shown',
        `Redirected to: ${createUrl}`,
        'high',
        ssPath
      );
    }

    // ─── STEP 6: Admin panel ──────────────────────────────────────────────────
    console.log('\n=== Admin panel ===');
    await page.goto(`${WEB}/admin`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1500);
    ssPath = await screenshot(page, '09-admin-panel-authed');
    const adminUrl = page.url();
    const adminText = await page.textContent('body');
    console.log(`    URL: ${adminUrl}`);
    const hasUserTable = adminText?.includes('Пользователи') || adminText?.includes('Роли') || adminText?.includes('Логин');
    console.log(`    Has user table: ${hasUserTable}`);

    if (adminUrl.includes('/admin') && hasUserTable) {
      pass('Admin panel accessible and shows user management');
    } else if (adminUrl === `${WEB}/` || adminUrl === WEB + '/') {
      bug(
        'Admin panel redirects to home even for admin user',
        '1. Login as admin. 2. Navigate to /admin.',
        'Admin panel user management visible',
        `Redirected to: ${adminUrl}`,
        'high',
        ssPath
      );
    } else {
      fail(`Admin panel: URL=${adminUrl}, hasUserTable=${hasUserTable}`);
    }

    // ─── STEP 7: Session persistence after reload ─────────────────────────────
    console.log('\n=== Session persistence after hard reload ===');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    ssPath = await screenshot(page, '10-after-reload');
    const reloadText = await page.textContent('body');
    const reloadUrl = page.url();
    console.log(`    URL after reload: ${reloadUrl}`);
    // After reload, accessToken is LOST (not persisted), but user object is kept
    // So the page may show "logged in" visually but API calls will 401
    const userPersisted = reloadText?.includes('@admin') || reloadText?.includes('admin');
    console.log(`    User visible after reload: ${userPersisted}`);
    if (!reloadUrl.includes('/admin')) {
      bug(
        'Admin panel redirects to home after page reload (session not fully persistent)',
        '1. Login. 2. Navigate to /admin. 3. Reload page.',
        'Admin panel remains accessible (user is admin)',
        `After reload: redirected to ${reloadUrl}. accessToken not persisted — only user object in localStorage`,
        'medium',
        ssPath
      );
    } else {
      pass('Admin panel accessible after reload');
    }

    // ─── STEP 8: Match page after reload ──────────────────────────────────────
    if (activeMatch) {
      // Find a still-active match (not the one we just submitted to)
      const matchesRes2 = await req('GET', `/api/tournaments/${activeSETournament.id}/matches`, undefined, adminToken);
      const allMatches2 = matchesRes2.data || [];
      const activeMatch2 = allMatches2.find(m => !m.isFinished && !m.isBye && m.player1Id && m.player2Id);

      if (activeMatch2) {
        console.log('\n=== Match page after reload (tests token persistence) ===');
        await page.goto(`${WEB}/matches/${activeMatch2.id}`, { waitUntil: 'networkidle', timeout: 10000 });
        await page.waitForTimeout(1500);
        ssPath = await screenshot(page, '11-match-page-after-reload');
        const matchText2 = await page.textContent('body');
        const hasResultForm2 = await page.locator('input[type="number"]').count();
        console.log(`    Score inputs after reload: ${hasResultForm2}`);
        console.log(`    URL: ${page.url()}`);

        if (hasResultForm2 === 0) {
          bug(
            'Match result form disappears after page reload (token not persisted)',
            '1. Login as admin. 2. Navigate directly to /matches/{id} (fresh load, not from session navigation).',
            'Result entry form visible (user is organizer and admin)',
            'Result form not shown — accessToken not in Zustand persist (only user), so canSetResult fails on direct load',
            'high',
            ssPath
          );
        } else {
          pass('Match result form visible after reload');
        }
      }
    }

    // ─── STEP 9: Profile page ─────────────────────────────────────────────────
    console.log('\n=== Profile page (should redirect if not logged in after reload) ===');
    // Create fresh context (truly unauthenticated)
    const freshCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const freshPage = await freshCtx.newPage();
    await freshPage.goto(`${WEB}/profile`, { waitUntil: 'networkidle', timeout: 10000 });
    await freshPage.waitForTimeout(1500);
    ssPath = await screenshot(freshPage, '12-profile-unauthenticated');
    const freshUrl = freshPage.url();
    console.log(`    Profile URL (unauthenticated): ${freshUrl}`);
    if (freshUrl === `${WEB}/` || freshUrl === WEB) {
      pass('Profile page redirects unauthenticated user to home');
    } else if (freshUrl.includes('/profile')) {
      fail('Profile page accessible without authentication');
    }
    await freshCtx.close();

  } finally {
    await browser.close();
  }

  // ─── RESULTS ────────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULTS: ${passCount} PASSED, ${failCount} FAILED, ${bugCount} BUGS`);
  console.log('='.repeat(60));

  if (bugs.length > 0) {
    console.log('\nBUGS FOUND:');
    for (const b of bugs) {
      console.log(`\nBug #${b.num} [${b.severity.toUpperCase()}]: ${b.title}`);
      console.log(`  Steps: ${b.steps}`);
      console.log(`  Expected: ${b.expected}`);
      console.log(`  Actual: ${b.actual}`);
      if (b.screenshotPath) console.log(`  Screenshot: ${b.screenshotPath}`);
    }
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
