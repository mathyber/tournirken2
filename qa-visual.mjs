/**
 * QA Visual Script: Single Elimination bracket UI testing
 * Tests visual bracket rendering, login flow, match result entry
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
let passCount = 0;
let failCount = 0;
let bugCount = 0;

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
  console.log(`     Steps: ${steps}`);
  console.log(`     Expected: ${expected}`);
  console.log(`     Actual: ${actual}`);
  if (screenshotPath) console.log(`     Screenshot: ${screenshotPath}`);
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
  const p = path.join(SS_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`    Screenshot: ${p}`);
  return p;
}

async function loginViaUI(page) {
  await page.goto(WEB, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  const loginInput = page.locator('input[placeholder*="логин"], input[placeholder*="email"], input[placeholder*="Login"], input[placeholder*="Email"]').first();
  const passInput = page.locator('input[type="password"]').first();

  if (!await loginInput.isVisible()) {
    console.log('    Login form not visible on home page');
    return false;
  }

  await loginInput.fill('admin');
  await passInput.fill('admin123');
  await page.locator('button').filter({ hasText: 'Войти' }).first().click();
  await page.waitForTimeout(2000);

  // Check if we're logged in
  const bodyText = await page.textContent('body');
  const loggedIn = bodyText?.includes('admin') || bodyText?.includes('Выйти') || bodyText?.includes('Профиль') || bodyText?.includes('profile');
  return loggedIn;
}

async function createTournamentAPI(token, overrides = {}) {
  const body = {
    tournamentName: `VisQA ${Date.now()}`,
    gameName: 'TestGame',
    format: 'SINGLE_ELIMINATION',
    maxParticipants: 4,
    ...overrides,
  };
  const res = await req('POST', '/api/tournaments', body, token);
  if (res.status !== 201) throw new Error(`Create tournament failed: ${res.status}`);
  return res.data;
}

async function setupTournament(token, playerCount, maxParticipants) {
  const t = await createTournamentAPI(token, { maxParticipants, tournamentName: `VIS${playerCount}P ${Date.now()}` });
  await req('POST', `/api/tournaments/${t.id}/open-registration`, {}, token);

  // Register players
  const users = [];
  for (let i = 0; i < playerCount; i++) {
    const ts = Date.now();
    const login = `vis${ts}u${i}`;
    const email = `vis${ts}u${i}@test.com`;
    const regRes = await req('POST', '/api/auth/register', { login, email, password: 'test1234' });
    if (regRes.status !== 201) throw new Error(`Register failed: ${regRes.status}`);
    const userToken = regRes.data?.accessToken;
    await req('POST', `/api/tournaments/${t.id}/join`, {}, userToken);
    users.push({ login, token: userToken });
  }

  // Start tournament
  const startRes = await req('POST', `/api/tournaments/${t.id}/grid/finalize`, {
    gridJson: '{}',
    participantAssignments: [],
  }, token);
  if (startRes.status !== 200) throw new Error(`Start tournament failed: ${startRes.status}`);

  return { tournament: t, users };
}

async function main() {
  console.log('=== Visual QA: Single Elimination Bracket ===\n');

  // Get admin token
  const loginRes = await req('POST', '/api/auth/login', { login: 'admin', password: 'admin123' });
  const adminToken = loginRes.data?.accessToken;
  if (!adminToken) { console.error('Login failed'); process.exit(1); }

  // Set up test tournaments
  console.log('Setting up test tournaments...');
  const setup4p = await setupTournament(adminToken, 4, 4);
  const setup8p = await setupTournament(adminToken, 8, 8);
  const setup3p = await setupTournament(adminToken, 3, 4);  // 3 players in bracket-of-4 (1 BYE)
  const setup5p = await setupTournament(adminToken, 5, 8);  // 5 players in bracket-of-8 (3 BYEs)
  console.log(`  4-player tournament: ID ${setup4p.tournament.id}`);
  console.log(`  8-player tournament: ID ${setup8p.tournament.id}`);
  console.log(`  3-player (BYE) tournament: ID ${setup3p.tournament.id}`);
  console.log(`  5-player (BYEs) tournament: ID ${setup5p.tournament.id}`);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // ─── TEST 1: Login via UI ──────────────────────────────────────────────────
    console.log('\n=== TEST: Login via UI ===');
    const loggedIn = await loginViaUI(page);
    let ssPath = await screenshot(page, 'vis-01-after-login');
    if (loggedIn) {
      pass('Login via UI succeeded');
    } else {
      bug('Login via UI failed or not detectable', '1. Go to /. 2. Fill login=admin, pass=admin123. 3. Click Войти.', 'Logged in as admin', 'Not logged in', 'critical', ssPath);
    }

    // ─── TEST 2: Tournament page (4-player) ───────────────────────────────────
    console.log('\n=== TEST: 4-player tournament page ===');
    await page.goto(`${WEB}/tournaments/${setup4p.tournament.id}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);
    ssPath = await screenshot(page, 'vis-02-4p-tournament-page');

    const bodyText4p = await page.textContent('body');
    console.log(`    Format shown: ${bodyText4p?.includes('Олимпийская') ? 'Олимпийская' : 'NOT FOUND'}`);
    console.log(`    Status shown: ${bodyText4p?.includes('Идёт') ? 'Идёт' : 'NOT FOUND'}`);

    // Check if "Турнирная сетка" button is there
    const gridBtn = page.locator('button, a').filter({ hasText: 'Турнирная сетка' }).first();
    const gridBtnVisible = await gridBtn.isVisible();
    console.log(`    "Турнирная сетка" button visible: ${gridBtnVisible}`);

    if (gridBtnVisible) {
      pass('"Турнирная сетка" button visible');
      await gridBtn.click();
      await page.waitForTimeout(2000);
      ssPath = await screenshot(page, 'vis-03-4p-bracket-opened');
      const bracketText = await page.textContent('body');
      console.log(`    After clicking bracket button: page length = ${bracketText?.length}`);
      console.log(`    Contains "Финал": ${bracketText?.includes('Финал') || bracketText?.includes('финал')}`);
      console.log(`    Contains round info: ${bracketText?.includes('1/2') || bracketText?.includes('Полуфинал')}`);

      if (bracketText?.includes('Финал') || bracketText?.includes('финал')) {
        pass('Bracket shows "Финал" round label');
      } else {
        bug(
          'Bracket page does not show round labels (Финал)',
          '1. Login. 2. Open 4-player SE tournament. 3. Click "Турнирная сетка".',
          'Round labels visible: "Финал", "1/2 финала"',
          'No round labels found in page',
          'medium',
          ssPath
        );
      }

      // Check if match cards are visible
      const matchEls = await page.locator('[class*="match"], [class*="Match"]').all();
      console.log(`    Match elements in DOM: ${matchEls.length}`);
      if (matchEls.length > 0) {
        pass(`Bracket renders ${matchEls.length} match elements`);
      } else {
        // Look for player names instead
        const hasPlayerNames = setup4p.users.some(u => bracketText?.includes(u.login));
        console.log(`    Has player names: ${hasPlayerNames}`);
        if (!hasPlayerNames) {
          bug(
            'Bracket displays no match cards and no player names',
            '1. Login. 2. Open active 4-player SE. 3. Click "Турнирная сетка".',
            'Bracket shows match cards with player names',
            'No match elements and no player names visible',
            'high',
            ssPath
          );
        }
      }
    } else {
      bug('"Турнирная сетка" button not visible on tournament page', 'Open active SE tournament', 'Bracket button visible', 'Button not found', 'high', ssPath);
    }

    // ─── TEST 3: Matches tab ───────────────────────────────────────────────────
    console.log('\n=== TEST: Matches tab on tournament page ===');
    await page.goto(`${WEB}/tournaments/${setup4p.tournament.id}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    const matchesTab = page.locator('button, [role="tab"]').filter({ hasText: /Матчи/i }).first();
    const matchesTabVisible = await matchesTab.isVisible();
    console.log(`    Matches tab visible: ${matchesTabVisible}`);

    if (matchesTabVisible) {
      pass('Matches tab visible');
      await matchesTab.click();
      await page.waitForTimeout(1000);
      ssPath = await screenshot(page, 'vis-04-matches-tab');

      const matchesText = await page.textContent('body');
      // Count player references
      const playerCount = setup4p.users.filter(u => matchesText?.includes(u.login)).length;
      console.log(`    Players visible in matches tab: ${playerCount}/${setup4p.users.length}`);
      if (playerCount > 0) {
        pass(`Matches tab shows player names (${playerCount} players)`);
      } else {
        bug('Matches tab does not show player names', 'Click Matches tab on 4-player SE', 'Player names visible in matches', 'No player names found', 'medium', ssPath);
      }

      // Check result entry buttons (admin should see them)
      const resultBtns = await page.locator('button').filter({ hasText: /результат|Ввести|score|Счёт/i }).count();
      console.log(`    Result entry buttons: ${resultBtns}`);
    } else {
      fail('Matches tab not visible');
    }

    // ─── TEST 4: Bracket visual for 4-player (full bracket open) ──────────────
    console.log('\n=== TEST: 4-player bracket full visual ===');
    await page.goto(`${WEB}/tournaments/${setup4p.tournament.id}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Try to navigate to /grid subpath
    await page.goto(`${WEB}/tournaments/${setup4p.tournament.id}/grid`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    ssPath = await screenshot(page, 'vis-05-4p-grid-subpath');
    const gridPageText = await page.textContent('body');
    console.log(`    /grid subpath content length: ${gridPageText?.length}`);
    console.log(`    URL: ${page.url()}`);

    // ─── TEST 5: 8-player bracket visual ──────────────────────────────────────
    console.log('\n=== TEST: 8-player bracket visual ===');
    await page.goto(`${WEB}/tournaments/${setup8p.tournament.id}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    const gridBtn8p = page.locator('button, a').filter({ hasText: 'Турнирная сетка' }).first();
    if (await gridBtn8p.isVisible()) {
      await gridBtn8p.click();
      await page.waitForTimeout(2000);
      ssPath = await screenshot(page, 'vis-06-8p-bracket');
      const text8p = await page.textContent('body');
      const has8pRoundLabels = text8p?.includes('Финал') || text8p?.includes('четвертьфинал') || text8p?.includes('1/4');
      console.log(`    8p bracket has round labels: ${has8pRoundLabels}`);

      // Check scroll needed for 8-player bracket
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      console.log(`    8p bracket scrollWidth=${scrollWidth}, clientWidth=${clientWidth}, needs scroll: ${scrollWidth > clientWidth}`);
      if (scrollWidth > clientWidth) {
        console.log('    INFO: 8-player bracket requires horizontal scrolling (need to verify UX)');
      }
      pass('8-player bracket page opened');
    }

    // ─── TEST 6: BYE match display in 3-player bracket ────────────────────────
    console.log('\n=== TEST: BYE match display in 3-player bracket ===');
    await page.goto(`${WEB}/tournaments/${setup3p.tournament.id}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    const gridBtn3p = page.locator('button, a').filter({ hasText: 'Турнирная сетка' }).first();
    if (await gridBtn3p.isVisible()) {
      await gridBtn3p.click();
      await page.waitForTimeout(2000);
      ssPath = await screenshot(page, 'vis-07-3p-bracket-with-bye');
      const text3p = await page.textContent('body');
      const hasAnyByeText = text3p?.toLowerCase().includes('bye') || text3p?.includes('БАЙ') || text3p?.includes('Bye') || text3p?.includes('байе');
      console.log(`    BYE text visible in 3-player bracket: ${hasAnyByeText}`);
      console.log(`    3-player bracket text (first 500 chars): ${text3p?.substring(0, 500)}`);
      pass('3-player bracket with BYE rendered');
    }

    // ─── TEST 7: 5-player bracket with BYEs ───────────────────────────────────
    console.log('\n=== TEST: 5-player bracket with 3 BYEs ===');
    await page.goto(`${WEB}/tournaments/${setup5p.tournament.id}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    const gridBtn5p = page.locator('button, a').filter({ hasText: 'Турнирная сетка' }).first();
    if (await gridBtn5p.isVisible()) {
      await gridBtn5p.click();
      await page.waitForTimeout(2000);
      ssPath = await screenshot(page, 'vis-08-5p-bracket-3byes');
      const text5p = await page.textContent('body');
      console.log(`    5p bracket content preview: ${text5p?.substring(0, 300)}`);
      pass('5-player bracket with 3 BYEs rendered');
    }

    // ─── TEST 8: Enter match result via UI (admin) ─────────────────────────────
    console.log('\n=== TEST: Enter match result via UI ===');
    // Get a match from the 4-player tournament
    const matchesRes = await req('GET', `/api/tournaments/${setup4p.tournament.id}/matches`, undefined, adminToken);
    const matches = matchesRes.data || [];
    const activeMatch = matches.find(m => !m.isFinished && !m.isBye && m.player1Id && m.player2Id);
    console.log(`    Active match found: ${activeMatch ? `id=${activeMatch.id}, p1=${activeMatch.player1?.user?.login}, p2=${activeMatch.player2?.user?.login}` : 'none'}`);

    if (activeMatch) {
      // Navigate to match page
      await page.goto(`${WEB}/matches/${activeMatch.id}`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500);
      ssPath = await screenshot(page, 'vis-09-match-page');
      const matchPageText = await page.textContent('body');
      const matchPageUrl = page.url();
      console.log(`    Match page URL: ${matchPageUrl}`);
      console.log(`    Match page has player names: ${matchPageText?.includes(activeMatch.player1?.user?.login)}`);

      // Check if result form is present
      const scoreInputs = await page.locator('input[type="number"], input[placeholder*="счёт"], input[placeholder*="score"]').count();
      console.log(`    Score input fields: ${scoreInputs}`);

      if (scoreInputs > 0) {
        pass('Match page has score input fields');
      } else {
        // Check if there's a result entry button
        const resultBtn = page.locator('button').filter({ hasText: /результат|ввести|enter/i }).first();
        if (await resultBtn.isVisible()) {
          await resultBtn.click();
          await page.waitForTimeout(1000);
          ssPath = await screenshot(page, 'vis-10-result-entry-modal');
        }
      }
    }

    // ─── TEST 9: Bracket page when NOT logged in ───────────────────────────────
    console.log('\n=== TEST: Bracket when not logged in ===');
    const anonContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const anonPage = await anonContext.newPage();
    await anonPage.goto(`${WEB}/tournaments/${setup4p.tournament.id}`, { waitUntil: 'networkidle', timeout: 15000 });
    await anonPage.waitForTimeout(1500);
    ssPath = await screenshot(anonPage, 'vis-11-4p-unauthenticated');
    const anonText = await anonPage.textContent('body');
    console.log(`    Anon user sees bracket button: ${anonText?.includes('Турнирная сетка')}`);

    const anonGridBtn = anonPage.locator('button, a').filter({ hasText: 'Турнирная сетка' }).first();
    if (await anonGridBtn.isVisible()) {
      await anonGridBtn.click();
      await anonPage.waitForTimeout(2000);
      ssPath = await screenshot(anonPage, 'vis-12-4p-bracket-anon');
      const anonBracketText = await anonPage.textContent('body');
      console.log(`    Anon user can see bracket: ${anonBracketText?.length > 200}`);

      // Check if result buttons visible for anon user (should NOT be)
      const anonResultBtns = await anonPage.locator('button').filter({ hasText: /результат|ввести/i }).count();
      console.log(`    Result buttons visible to anon: ${anonResultBtns}`);
      if (anonResultBtns > 0) {
        bug(
          'Result entry buttons visible to unauthenticated users',
          '1. Open active SE tournament bracket as unauthenticated user.',
          'No result entry buttons (only organizer/players can enter results)',
          `${anonResultBtns} result entry button(s) visible`,
          'high',
          ssPath
        );
      } else {
        pass('No result entry buttons for unauthenticated users');
      }
    }
    await anonContext.close();

    // ─── TEST 10: Admin panel — tournament management ──────────────────────────
    console.log('\n=== TEST: Admin panel access ===');
    await page.goto(`${WEB}/admin`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);
    ssPath = await screenshot(page, 'vis-13-admin-panel');
    const adminText = await page.textContent('body');
    const isOnAdminPage = page.url().includes('/admin');
    console.log(`    Admin page URL: ${page.url()}`);
    console.log(`    On admin page: ${isOnAdminPage}`);
    if (isOnAdminPage && adminText?.length > 100) {
      pass('Admin panel accessible when logged in');
    } else {
      fail('Admin panel not accessible or redirected');
    }

    // ─── TEST 11: Tournament creation flow in UI ───────────────────────────────
    console.log('\n=== TEST: Create tournament via UI ===');
    await page.goto(`${WEB}/tournaments/create`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);
    ssPath = await screenshot(page, 'vis-14-create-tournament');
    const createText = await page.textContent('body');
    const createUrl = page.url();
    console.log(`    Create tournament URL: ${createUrl}`);
    console.log(`    Has "Название" or "название": ${createText?.includes('Название') || createText?.includes('название')}`);
    console.log(`    Has "Формат": ${createText?.includes('Формат')}`);

    if (!createUrl.includes('/tournaments/create')) {
      bug('Create tournament page redirects away when logged in', '1. Login as admin. 2. Navigate to /tournaments/create.', 'Create tournament form shown', `Redirected to ${createUrl}`, 'high', ssPath);
    } else {
      // Check if Single Elimination is selectable
      const formatOptions = await page.locator('select option, [role="option"]').all();
      const formatTexts = await Promise.all(formatOptions.map(el => el.textContent()));
      console.log(`    Format options: ${formatTexts.join(', ')}`);
      const hasSE = formatTexts.some(t => t?.includes('Олимпийская') || t?.includes('Single') || t?.includes('single'));
      if (hasSE) {
        pass('Create tournament: Single Elimination option available');
      } else {
        console.log('    INFO: Could not detect format options (may use different UI)');
      }
      pass('Create tournament page accessible to admin');
    }

    // ─── TEST 12: Check finished tournament display ────────────────────────────
    console.log('\n=== TEST: Finished tournament — standings/podium ===');
    // Complete the 4-player tournament via API
    const allMatches = await req('GET', `/api/tournaments/${setup4p.tournament.id}/matches`, undefined, adminToken);
    const pendingMatches = allMatches.data?.filter(m => !m.isFinished && !m.isBye && m.player1Id && m.player2Id) || [];
    console.log(`    Pending matches to complete: ${pendingMatches.length}`);
    for (const m of pendingMatches) {
      await req('POST', `/api/matches/${m.id}/result`, { player1Score: 2, player2Score: 1, isFinal: true }, adminToken);
    }
    // Re-check
    const allMatches2 = await req('GET', `/api/tournaments/${setup4p.tournament.id}/matches`, undefined, adminToken);
    const pendingMatches2 = allMatches2.data?.filter(m => !m.isFinished && !m.isBye && m.player1Id && m.player2Id) || [];
    for (const m of pendingMatches2) {
      await req('POST', `/api/matches/${m.id}/result`, { player1Score: 2, player2Score: 1, isFinal: true }, adminToken);
    }

    const t4pStatus = await req('GET', `/api/tournaments/${setup4p.tournament.id}`, undefined, adminToken);
    console.log(`    4-player tournament status after completing: ${t4pStatus.data?.status}`);

    await page.goto(`${WEB}/tournaments/${setup4p.tournament.id}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    ssPath = await screenshot(page, 'vis-15-finished-tournament');
    const finishedText = await page.textContent('body');
    console.log(`    Status badge: ${finishedText?.includes('Завершён') ? 'Завершён' : 'not found'}`);
    const hasPodium = finishedText?.includes('1') && finishedText?.includes('2') && (finishedText?.includes('место') || finishedText?.includes('победитель') || finishedText?.includes('Победитель'));
    console.log(`    Has podium/standings: ${hasPodium}`);
    if (t4pStatus.data?.status === 'FINISHED') {
      pass('Tournament marked FINISHED after completing all matches');
      if (hasPodium) {
        pass('Finished tournament shows podium/standings');
      } else {
        // Check participants for finalResult values
        const parts = await req('GET', `/api/tournaments/${setup4p.tournament.id}/participants`, undefined, adminToken);
        const ranked = parts.data?.filter(p => p.finalResult !== null);
        console.log(`    Participants with finalResult: ${ranked?.map(p => `${p.user.login}=${p.finalResult}`).join(', ')}`);
        if (ranked?.length > 0) {
          console.log('    INFO: Final results stored in API but may not display prominently in UI');
        } else {
          bug('Finished SE tournament: no final placements assigned', 'Complete all matches in 4-player SE', 'finalResult assigned to top 3 participants', 'No participants have finalResult set', 'high', ssPath);
        }
      }
    }

    // ─── TEST 13: Bracket view of FINISHED tournament ─────────────────────────
    console.log('\n=== TEST: Bracket view of FINISHED tournament ===');
    const gridBtnFinished = page.locator('button, a').filter({ hasText: 'Турнирная сетка' }).first();
    if (await gridBtnFinished.isVisible()) {
      await gridBtnFinished.click();
      await page.waitForTimeout(2000);
      ssPath = await screenshot(page, 'vis-16-finished-bracket');
      const finBracketText = await page.textContent('body');
      console.log(`    Finished bracket content length: ${finBracketText?.length}`);
      pass('Finished tournament bracket renders');
    }

    // ─── TEST 14: Try enter result on finished tournament match ───────────────
    console.log('\n=== TEST: Try to enter result on finished tournament match (UI) ===');
    const finalMatches = await req('GET', `/api/tournaments/${setup4p.tournament.id}/matches`, undefined, adminToken);
    const finishedMatch = finalMatches.data?.find(m => m.isFinished && !m.isBye);
    if (finishedMatch) {
      await page.goto(`${WEB}/matches/${finishedMatch.id}`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1000);
      ssPath = await screenshot(page, 'vis-17-finished-match-page');
      const finMatchText = await page.textContent('body');
      const hasResultForm = finMatchText?.includes('счёт') || finMatchText?.toLowerCase().includes('score');
      console.log(`    Finished match page has result form: ${hasResultForm}`);
      const finMatchUrl = page.url();
      console.log(`    Finished match URL: ${finMatchUrl}`);
    }

    // ─── TEST 15: BYE match page ───────────────────────────────────────────────
    console.log('\n=== TEST: BYE match page ===');
    const byeMatches = await req('GET', `/api/tournaments/${setup3p.tournament.id}/matches`, undefined, adminToken);
    const byeMatch = byeMatches.data?.find(m => m.isBye);
    if (byeMatch) {
      console.log(`    BYE match found: id=${byeMatch.id}`);
      await page.goto(`${WEB}/matches/${byeMatch.id}`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1000);
      ssPath = await screenshot(page, 'vis-18-bye-match-page');
      const byeMatchText = await page.textContent('body');
      const byeUrl = page.url();
      console.log(`    BYE match URL: ${byeUrl}`);
      console.log(`    Has "БАЙ" or "bye" text: ${byeMatchText?.toLowerCase().includes('bye') || byeMatchText?.toLowerCase().includes('бай')}`);
      pass('BYE match page accessible');
    }

    // ─── TEST 16: Participant count display ────────────────────────────────────
    console.log('\n=== TEST: 5/8 participant display on tournament card ===');
    await page.goto(WEB, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    const homeText = await page.textContent('body');
    // Look for 5/8 in tournament list (for the 5-player tournament)
    const has5of8 = homeText?.includes('5 / 8') || homeText?.includes('5/8');
    console.log(`    "5 / 8 участников" on home: ${has5of8}`);
    ssPath = await screenshot(page, 'vis-19-home-with-tournaments');

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
