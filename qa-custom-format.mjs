/**
 * QA Test Script: CUSTOM Tournament Format + Visual Drag-and-Drop Bracket Builder
 * Adversarial testing to find bugs.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:5173';
const SCREENSHOTS_DIR = path.join('qa-screenshots', 'custom');

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let screenshotIndex = 0;
async function ss(page, name) {
  const file = path.join(SCREENSHOTS_DIR, `${String(++screenshotIndex).padStart(3, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return path.resolve(file);
}

const bugs = [];
function bug(severity, title, steps, expected, actual, screenshotPath = null) {
  bugs.push({ severity, title, steps, expected, actual, screenshotPath });
  console.log(`\n[BUG/${severity.toUpperCase()}] ${title}`);
  console.log(`  Expected: ${expected}`);
  console.log(`  Actual:   ${actual}`);
  if (screenshotPath) console.log(`  Screenshot: ${screenshotPath}`);
}

// Login via the sidebar on home page
async function loginAsAdmin(page) {
  await page.goto(`${BASE_URL}/`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.locator('#login-username').fill('admin');
  await page.locator('#login-password').fill('admin123');
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForTimeout(2000);
  console.log('Login done, checking auth state...');
  // Verify logged in by checking auth store or page content
  const isLogged = await page.locator('#login-username').count() === 0;
  console.log(`Admin logged in: ${isLogged}`);
  return isLogged;
}

// Create tournament via API (proper field names)
async function createCustomTournament(page) {
  return page.evaluate(async () => {
    const loginR = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'admin', password: 'admin123' }),
    });
    const { accessToken } = await loginR.json();

    const r = await fetch('/api/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        tournamentName: 'QA Custom ' + Date.now(),
        gameName: 'Test Game',
        format: 'CUSTOM',
        maxParticipants: 8,
        info: 'QA Test',
      }),
    });
    const body = await r.json();
    return { accessToken, tournament: r.ok ? body : null, error: r.ok ? null : body, status: r.status };
  });
}

async function getToken(page) {
  return page.evaluate(async () => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'admin', password: 'admin123' }),
    });
    const { accessToken } = await r.json();
    return accessToken;
  });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  const networkErrors = [];
  page.on('response', resp => {
    if (resp.status() >= 400 && !resp.url().includes('favicon') && !resp.url().includes('vite')) {
      networkErrors.push(`${resp.status()} ${resp.url()}`);
    }
  });

  try {
    // ──────────────────────────────────────────────────────────
    // SETUP
    // ──────────────────────────────────────────────────────────
    console.log('\n=== SETUP: Login as admin ===');
    await loginAsAdmin(page);
    await ss(page, '01-after-login');

    // ──────────────────────────────────────────────────────────
    // TEST 1: Create CUSTOM tournament via UI
    // ──────────────────────────────────────────────────────────
    console.log('\n=== TEST 1: Create CUSTOM tournament via UI ===');
    await page.goto(`${BASE_URL}/tournaments/create`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Fill tournamentName input (id="name")
    await page.locator('#name').fill('QA Custom UI Test');

    // Fill gameName input
    const gameInput = page.locator('input[placeholder*="игр" i], input[placeholder*="game" i]').first();
    const gameInputById = page.locator('#gameName, #game');
    const gameInputEl = await gameInputById.count() > 0 ? gameInputById : gameInput;
    // Find the input after the gameName label
    const gameLabel = page.locator('label').filter({ hasText: /игр/i });
    if (await gameLabel.count() > 0) {
      const gameLabelFor = await gameLabel.first().getAttribute('for');
      if (gameLabelFor) {
        await page.locator(`#${gameLabelFor}`).fill('Dota 2');
      } else {
        await gameInputEl.first().fill('Dota 2');
      }
    }

    await ss(page, '02-create-form');

    // Select CUSTOM format
    const formatTrigger = page.locator('#format');
    await formatTrigger.click();
    await page.waitForTimeout(500);
    await ss(page, '03-format-dropdown');

    const customOpt = page.locator('[role="option"]').filter({ hasText: /Кастом/i });
    if (await customOpt.count() > 0) {
      await customOpt.first().click();
      await page.waitForTimeout(300);
      console.log('"Кастомный" format option selected');
    } else {
      const opts = await page.locator('[role="option"]').allTextContents();
      bug('critical', '"Кастомный" format option not found in create form dropdown',
        'Go to /tournaments/create, click format dropdown',
        '"Кастомный" visible in list',
        `Options found: ${opts.join(', ')}`);
      await page.keyboard.press('Escape');
    }

    // Fill maxParticipants if needed
    const maxPInput = page.locator('input[type="number"]').first();
    if (await maxPInput.count() > 0 && await maxPInput.inputValue() === '') {
      await maxPInput.fill('8');
    }

    await ss(page, '04-form-filled');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle');

    const afterCreateUrl = page.url();
    console.log(`After create URL: ${afterCreateUrl}`);
    await ss(page, '05-after-create');

    const uiTid = afterCreateUrl.match(/\/tournaments\/(\d+)/)?.[1];
    console.log(`UI tournament ID: ${uiTid}`);

    if (!uiTid) {
      const errText = await page.locator('[class*="error"], [class*="destructive"], p.text-red').textContent().catch(() => '');
      bug('high', 'Create CUSTOM tournament via UI fails or does not redirect',
        '1. Go to /tournaments/create\n2. Fill tournamentName, gameName, select CUSTOM format\n3. Submit',
        'Redirected to /tournaments/:id',
        `URL remains: ${afterCreateUrl}. Error: ${errText}`);
    }

    // ──────────────────────────────────────────────────────────
    // TEST 2: "Открыть конструктор" button on detail page
    // ──────────────────────────────────────────────────────────
    console.log('\n=== TEST 2: "Открыть конструктор" button on detail ===');
    if (uiTid) {
      await page.goto(`${BASE_URL}/tournaments/${uiTid}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      await ss(page, '06-detail-page');

      const builderBtn = page.locator(`a[href="/tournaments/${uiTid}/custom-builder"]`);
      const btnCount = await builderBtn.count();
      console.log(`"Открыть конструктор" button count: ${btnCount}`);

      if (btnCount === 0) {
        const ss6 = await ss(page, '06b-missing-button');
        bug('critical', '"Открыть конструктор" button absent on CUSTOM tournament detail',
          '1. Create CUSTOM tournament\n2. Navigate to its detail page',
          'Button/link "Открыть конструктор" visible',
          'Button not found in page',
          ss6);
      } else {
        console.log('"Открыть конструктор" button FOUND OK');
      }
    }

    // ──────────────────────────────────────────────────────────
    // Use API to create tournament for the rest of the tests
    // ──────────────────────────────────────────────────────────
    const { tournament, error: apiErr, status: apiStatus, accessToken: tok } = await createCustomTournament(page);
    if (!tournament?.id) {
      throw new Error(`Cannot create tournament via API: ${JSON.stringify(apiErr)} (status ${apiStatus})`);
    }
    const tid = tournament.id;
    console.log(`\nAPI tournament created: id=${tid}`);

    // ──────────────────────────────────────────────────────────
    // TEST 3-4: Builder page — canvas and toolbar visible
    // ──────────────────────────────────────────────────────────
    console.log('\n=== TEST 3-4: Custom builder page ===');
    await page.goto(`${BASE_URL}/tournaments/${tid}/custom-builder`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // ReactFlow initializes async

    const ss_builder = await ss(page, '07-builder-initial');
    console.log(`Builder screenshot: ${ss_builder}`);

    const hasReactFlow = await page.locator('.react-flow').count() > 0;
    console.log(`ReactFlow canvas: ${hasReactFlow}`);
    if (!hasReactFlow) {
      bug('critical', 'ReactFlow canvas not rendered in custom builder',
        'Navigate to /tournaments/:id/custom-builder as authenticated organizer',
        '.react-flow element visible',
        'No .react-flow element in DOM',
        ss_builder);
    }

    // Toolbar buttons
    const toolbarBtns = page.locator('aside button');
    const toolbarBtnTexts = await toolbarBtns.allTextContents();
    console.log(`Sidebar buttons: ${toolbarBtnTexts.join(' | ')}`);

    const hasMatchBtn = toolbarBtnTexts.some(t => /Матч/i.test(t));
    const hasGroupBtn = toolbarBtnTexts.some(t => /Группа/i.test(t));
    const hasPartBtn = toolbarBtnTexts.some(t => /Участник/i.test(t));
    const hasFinalBtn = toolbarBtnTexts.some(t => /Финал/i.test(t));

    if (!hasMatchBtn || !hasGroupBtn || !hasPartBtn || !hasFinalBtn) {
      bug('high', 'One or more toolbar buttons missing in custom builder sidebar',
        'Navigate to /tournaments/:id/custom-builder',
        'Buttons: "+ Матч", "+ Группа", "+ Участник", "+ Финал" all visible',
        `Found: Match=${hasMatchBtn} Group=${hasGroupBtn} Participant=${hasPartBtn} Final=${hasFinalBtn}. Buttons: ${toolbarBtnTexts.join(', ')}`,
        ss_builder);
    } else {
      console.log('All toolbar buttons present OK');
    }

    // ──────────────────────────────────────────────────────────
    // TEST 5: Add Participant node
    // ──────────────────────────────────────────────────────────
    console.log('\n=== TEST 5: Add Participant node ===');
    const partBtn = page.locator('aside button').filter({ hasText: /Участник/ }).first();
    await partBtn.click();
    await page.waitForTimeout(600);
    const nodesCount1 = await page.locator('.react-flow__node').count();
    console.log(`Nodes after add participant: ${nodesCount1}`);

    if (nodesCount1 === 0) {
      const s = await ss(page, '08-no-participant-node');
      bug('high', 'Participant node not appearing on canvas after clicking toolbar',
        'Open builder, click "+ Участник"',
        'Node appears on canvas',
        'Canvas still empty',
        s);
    } else {
      await ss(page, '08-participant-added');
      console.log('Participant node added OK');
    }

    // ──────────────────────────────────────────────────────────
    // TEST 6: Add Match node
    // ──────────────────────────────────────────────────────────
    console.log('\n=== TEST 6: Add Match node ===');
    const matchBtn = page.locator('aside button').filter({ hasText: /Матч/ }).first();
    await matchBtn.click();
    await page.waitForTimeout(600);
    const nodesCount2 = await page.locator('.react-flow__node').count();
    console.log(`Nodes after add match: ${nodesCount2}`);
    await ss(page, '09-match-added');

    // ──────────────────────────────────────────────────────────
    // TEST 7: Add Final node
    // ──────────────────────────────────────────────────────────
    console.log('\n=== TEST 7: Add Final node ===');
    const finalBtn = page.locator('aside button').filter({ hasText: /Финал/ }).first();
    await finalBtn.click();
    await page.waitForTimeout(600);
    const nodesCount3 = await page.locator('.react-flow__node').count();
    console.log(`Nodes after add final: ${nodesCount3}`);
    await ss(page, '10-final-added');

    // ──────────────────────────────────────────────────────────
    // TEST 8: Add SECOND Final node — should be blocked
    // ──────────────────────────────────────────────────────────
    console.log('\n=== TEST 8: Second Final node should be blocked ===');
    {
      let alertText = null;
      page.once('dialog', async dialog => {
        alertText = dialog.message();
        console.log(`Alert: "${alertText}"`);
        await dialog.accept();
      });
      await finalBtn.click();
      await page.waitForTimeout(800);

      const nodesAfter2Final = await page.locator('.react-flow__node').count();
      const s = await ss(page, '11-second-final');
      console.log(`Alert captured: ${alertText}, total nodes: ${nodesAfter2Final}`);

      if (!alertText) {
        const finalNodes = page.locator('.react-flow__node').filter({ hasText: /Победитель/ });
        const fCount = await finalNodes.count();
        if (fCount > 1) {
          bug('high', 'Second Final node added without any blocking message',
            '1. Add one Final node\n2. Click "+ Финал" again',
            'Alert: "Узел «Победитель» уже добавлен. Допускается только один."',
            `No alert shown; ${fCount} Final nodes visible`,
            s);
        } else {
          console.log('Second Final silently blocked (no alert, count=1) — might still be a UX issue');
        }
      } else {
        console.log('Second Final blocked with alert OK');
      }
    }

    // ──────────────────────────────────────────────────────────
    // TEST 9: Save empty canvas — validation error expected
    // ──────────────────────────────────────────────────────────
    console.log('\n=== TEST 9: Save empty canvas ===');
    const emptyTid = (await createCustomTournament(page)).tournament?.id;
    await page.goto(`${BASE_URL}/tournaments/${emptyTid}/custom-builder`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Identify Save button
    const allBtnTexts = await page.locator('button').allTextContents();
    console.log('All buttons on page:', allBtnTexts.join(' | '));

    const saveBtn = page.locator('button').filter({ hasText: /Сохранить|схему/i }).first();
    const saveBtnCount = await saveBtn.count();
    console.log(`Save button count: ${saveBtnCount}`);

    if (saveBtnCount === 0) {
      const s = await ss(page, '12-no-save-btn');
      bug('high', 'Save button not found in custom builder header',
        'Navigate to /tournaments/:id/custom-builder',
        'Button "Сохранить схему" or similar visible',
        `No such button. Buttons: ${allBtnTexts.join(', ')}`,
        s);
    } else {
      await saveBtn.click();
      await page.waitForTimeout(1000);
      const s = await ss(page, '12-save-empty');

      const errText = await page.locator('[class*="destructive"]').allTextContents();
      console.log(`Error text after saving empty: ${errText.join(' ')}`);

      const hasValidationErrors = errText.some(t => /Победитель|подключён|ошибк/i.test(t));

      if (!hasValidationErrors) {
        // Check header error count
        const headerErrCount = await page.locator('span').filter({ hasText: /ошибк/i }).count();
        console.log(`Header error count indicator: ${headerErrCount}`);
        if (headerErrCount === 0) {
          bug('high', 'No validation error shown when saving empty canvas',
            '1. Open fresh custom builder\n2. Click Save with no nodes',
            'Validation error messages shown',
            'No errors visible',
            s);
        }
      } else {
        console.log('Validation errors shown for empty canvas OK');
      }
    }

    // ──────────────────────────────────────────────────────────
    // TEST 10: Save with disconnected StartNodes
    // ──────────────────────────────────────────────────────────
    console.log('\n=== TEST 10: Save with disconnected StartNodes ===');
    {
      const disconnTid = (await createCustomTournament(page)).tournament?.id;
      await page.goto(`${BASE_URL}/tournaments/${disconnTid}/custom-builder`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Add 2 participants + Final, don't connect
      const pBtn = page.locator('aside button').filter({ hasText: /Участник/ }).first();
      await pBtn.click(); await page.waitForTimeout(300);
      await pBtn.click(); await page.waitForTimeout(300);
      const fBtn = page.locator('aside button').filter({ hasText: /Финал/ }).first();
      await fBtn.click(); await page.waitForTimeout(300);

      const saveB = page.locator('button').filter({ hasText: /Сохранить|схему/i }).first();
      await saveB.click();
      await page.waitForTimeout(1000);
      const s = await ss(page, '13-save-disconnected');

      const errItems = page.locator('li').filter({ hasText: /не подключён/i });
      const errCount = await errItems.count();
      console.log(`"Not connected" errors: ${errCount}`);

      if (errCount === 0) {
        const allErrors = await page.locator('[class*="destructive"]').allTextContents();
        console.log(`All destructive texts: ${allErrors.join(' | ')}`);
        if (!allErrors.some(t => /подключён|подключен/i.test(t))) {
          bug('high', 'No validation error for disconnected StartNodes',
            '1. Add 2 participants + 1 Final (no connections)\n2. Save',
            '"Участник не подключён" validation error',
            'No such error',
            s);
        }
      } else {
        console.log(`Disconnected StartNode validation OK (${errCount} errors)`);
      }
    }

    // ──────────────────────────────────────────────────────────
    // TEST 11 (CRITICAL): Verify customSchema in GET /api/tournaments/:id
    // ──────────────────────────────────────────────────────────
    console.log('\n=== TEST 11: GET /api/tournaments/:id includes customSchema ===');
    {
      const { tournament: t2, accessToken: tok2 } = await createCustomTournament(page);
      const t2id = t2?.id;

      const simpleSchema = {
        nodes: [
          { id: 's1', type: 'start', position: { x: 50, y: 100 }, data: { label: 'P1' } },
          { id: 's2', type: 'start', position: { x: 50, y: 200 }, data: { label: 'P2' } },
          { id: 'm1', type: 'match', position: { x: 300, y: 150 }, data: { label: 'Матч', round: 1 } },
          { id: 'f1', type: 'final', position: { x: 600, y: 150 }, data: { label: 'Победитель' } },
        ],
        edges: [
          { id: 'e1', source: 's1', target: 'm1', sourceHandle: 'output', targetHandle: 'input-1', type: 'smoothstep', data: { edgeType: 'participant' } },
          { id: 'e2', source: 's2', target: 'm1', sourceHandle: 'output', targetHandle: 'input-2', type: 'smoothstep', data: { edgeType: 'participant' } },
          { id: 'e3', source: 'm1', target: 'f1', sourceHandle: 'winner', targetHandle: 'input', type: 'smoothstep', data: { edgeType: 'winner' } },
        ],
      };

      // Save schema
      const saveR = await page.evaluate(async ({ id, schema, token }) => {
        const r = await fetch(`/api/tournaments/${id}/custom-schema`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(schema),
        });
        return { status: r.status, body: await r.json().catch(() => ({})) };
      }, { id: t2id, schema: simpleSchema, token: tok2 });

      console.log(`Schema save: ${saveR.status}`);

      // GET tournament — check if customSchema included
      const getR = await page.evaluate(async ({ id, token }) => {
        const r = await fetch(`/api/tournaments/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return { status: r.status, body: await r.json().catch(() => ({})) };
      }, { id: t2id, token: tok2 });

      const hasCustomSchema = 'customSchema' in (getR.body || {});
      const customSchemaValue = getR.body?.customSchema;
      console.log(`GET /tournaments/:id has customSchema: ${hasCustomSchema}, value: ${customSchemaValue ? 'SET' : 'null/undefined'}`);
      console.log(`Response fields: ${Object.keys(getR.body || {}).join(', ')}`);

      if (!hasCustomSchema || customSchemaValue === null || customSchemaValue === undefined) {
        bug('critical',
          'GET /api/tournaments/:id returns null/missing customSchema after saving schema — "Запустить турнир" button never appears',
          '1. POST /custom-schema with valid schema\n2. GET /api/tournaments/:id',
          'customSchema field is a non-null JSON string',
          `customSchema=${JSON.stringify(customSchemaValue)}. canFinalize logic in builder: !!tournament.customSchema → always false. "Запустить турнир" button never shows.`);
      } else {
        console.log('customSchema field present in GET response OK');
      }

      // ──────────────────────────────────────────────────────────
      // TEST 12: Builder shows "Запустить турнир" after schema saved
      // ──────────────────────────────────────────────────────────
      console.log('\n=== TEST 12: Builder launch button after schema saved ===');
      await page.goto(`${BASE_URL}/tournaments/${t2id}/custom-builder`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
      const s12 = await ss(page, '14-builder-after-schema');

      const launchBtn = page.locator('button').filter({ hasText: /Запустить/ });
      const launchCount = await launchBtn.count();
      console.log(`Launch button count: ${launchCount}`);

      if (launchCount === 0) {
        const btns = await page.locator('button').allTextContents();
        bug('critical',
          '"Запустить турнир" button absent from builder after saving schema',
          '1. Save valid custom schema\n2. Navigate to /tournaments/:id/custom-builder',
          '"Запустить турнир" button visible in header',
          `Not found. All buttons: ${btns.join(', ')}`,
          s12);
      } else {
        console.log('"Запустить турнир" button present OK');
      }

      // ──────────────────────────────────────────────────────────
      // TEST 13: Finalize via API
      // ──────────────────────────────────────────────────────────
      console.log('\n=== TEST 13: Finalize via API ===');
      const finalizeR = await page.evaluate(async ({ id, token }) => {
        const r = await fetch(`/api/tournaments/${id}/custom-finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        return { status: r.status, body: await r.json().catch(() => ({})) };
      }, { id: t2id, token: tok2 });

      console.log(`Finalize: ${finalizeR.status}`, JSON.stringify(finalizeR.body));

      if (finalizeR.status !== 200) {
        bug('high', 'POST /api/tournaments/:id/custom-finalize fails',
          '1. Save valid schema\n2. POST custom-finalize',
          '200 OK with {success:true, matchCount:N}',
          `Status ${finalizeR.status}: ${JSON.stringify(finalizeR.body)}`);
      } else {
        console.log(`Finalize OK, matchCount=${finalizeR.body?.matchCount}`);

        // Navigate to tournament after finalize
        await page.goto(`${BASE_URL}/tournaments/${t2id}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
        await ss(page, '15-after-finalize');
        const statusText = await page.locator('body').textContent();
        console.log(`Page body excerpt: ${(statusText || '').slice(0, 300)}`);
      }
    }

    // ──────────────────────────────────────────────────────────
    // TEST 14 (CRITICAL): Edge type bug in finalize backend
    // ──────────────────────────────────────────────────────────
    console.log('\n=== TEST 14: Edge type bug — match progression links ===');
    {
      const { tournament: t3, accessToken: tok3 } = await createCustomTournament(page);
      const t3id = t3?.id;

      // 3-player tournament: s1+s2 → m1, winner→m2, s3→m2, winner→final
      const multiSchema = {
        nodes: [
          { id: 's1', type: 'start', position: { x: 50, y: 100 }, data: { label: 'P1' } },
          { id: 's2', type: 'start', position: { x: 50, y: 200 }, data: { label: 'P2' } },
          { id: 's3', type: 'start', position: { x: 50, y: 300 }, data: { label: 'P3' } },
          { id: 'm1', type: 'match', position: { x: 300, y: 150 }, data: { label: 'Semi', round: 1 } },
          { id: 'm2', type: 'match', position: { x: 600, y: 250 }, data: { label: 'Final Match', round: 2 } },
          { id: 'f1', type: 'final', position: { x: 900, y: 250 }, data: { label: 'Winner' } },
        ],
        edges: [
          // participant edges (type=smoothstep, data.edgeType=participant)
          { id: 'e1', source: 's1', target: 'm1', sourceHandle: 'output', targetHandle: 'input-1', type: 'smoothstep', data: { edgeType: 'participant' } },
          { id: 'e2', source: 's2', target: 'm1', sourceHandle: 'output', targetHandle: 'input-2', type: 'smoothstep', data: { edgeType: 'participant' } },
          { id: 'e3', source: 's3', target: 'm2', sourceHandle: 'output', targetHandle: 'input-1', type: 'smoothstep', data: { edgeType: 'participant' } },
          // winner edge: frontend stores type='smoothstep', data.edgeType='winner'
          // backend line 579: edges.filter(e => e.type === 'winner') — FAILS for frontend-generated edges
          { id: 'e4', source: 'm1', target: 'm2', sourceHandle: 'winner', targetHandle: 'input-2', type: 'smoothstep', data: { edgeType: 'winner' } },
          { id: 'e5', source: 'm2', target: 'f1', sourceHandle: 'winner', targetHandle: 'input', type: 'smoothstep', data: { edgeType: 'winner' } },
        ],
      };

      await page.evaluate(async ({ id, schema, token }) => {
        await fetch(`/api/tournaments/${id}/custom-schema`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(schema),
        });
      }, { id: t3id, schema: multiSchema, token: tok3 });

      const fin3 = await page.evaluate(async ({ id, token }) => {
        const r = await fetch(`/api/tournaments/${id}/custom-finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        return { status: r.status, body: await r.json().catch(() => ({})) };
      }, { id: t3id, token: tok3 });

      console.log(`Multi-round finalize: ${fin3.status}`, JSON.stringify(fin3.body));

      if (fin3.status === 200) {
        const grid3 = await page.evaluate(async ({ id, token }) => {
          const r = await fetch(`/api/tournaments/${id}/grid`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          return { status: r.status, body: await r.json().catch(() => ({})) };
        }, { id: t3id, token: tok3 });

        const matches3 = grid3.body?.matches || [];
        console.log(`Matches created: ${matches3.length}`);
        for (const m of matches3) {
          console.log(`  Match id=${m.id} round=${m.roundNumber} nextMatchId=${m.nextMatchId}`);
        }

        const semiFinalMatch = matches3.find(m => m.roundNumber === 1);
        const finalMatch = matches3.find(m => m.roundNumber === 2);

        if (semiFinalMatch && semiFinalMatch.nextMatchId === null) {
          bug('critical',
            'Winner edge (match→match) does NOT create nextMatchId link — tournament bracket progression is broken',
            '1. Build schema: P1+P2→m1(semi), winner of m1→m2(final), P3→m2\n2. Save + finalize\n3. Check matches in DB',
            'match1.nextMatchId = match2.id',
            `match1.nextMatchId = null. ROOT CAUSE: finalize backend at line 579 filters edges with \`e.type === 'winner'\` but the frontend's onConnect() stores winner edges as \`{type: 'smoothstep', data: {edgeType: 'winner'}}\`. The correct check should be \`e.data?.edgeType === 'winner'\` OR the saved schema should store type='winner' instead of 'smoothstep'.`);
        } else if (semiFinalMatch?.nextMatchId) {
          console.log('nextMatchId correctly set — edge type handled properly');
        }
      }
    }

    // ──────────────────────────────────────────────────────────
    // TEST 15: Stage.findUnique by name — Prisma schema bug
    // ──────────────────────────────────────────────────────────
    console.log('\n=== TEST 15: Stage.findUnique by name uniqueness ===');
    {
      const schemaContent = fs.readFileSync(
        path.join('apps', 'api', 'prisma', 'schema.prisma'), 'utf-8');
      const stageBlock = schemaContent.match(/model Stage \{[\s\S]*?\n\}/)?.[0] || '';
      console.log('Stage model block:\n', stageBlock);

      const nameLineMatch = stageBlock.match(/name\s+\w+.*(\n|$)/);
      const nameLine = nameLineMatch?.[0]?.trim() || '';
      console.log(`Stage name field: "${nameLine}"`);

      const nameHasUnique = nameLine.includes('@unique');
      console.log(`Stage.name has @unique: ${nameHasUnique}`);

      if (!nameHasUnique) {
        // Try to actually trigger the bug by running finalize twice
        const { tournament: stageT, accessToken: stageTok } = await createCustomTournament(page);
        const stageId = stageT?.id;

        const schemaForStage = {
          nodes: [
            { id: 's1', type: 'start', position: { x: 50, y: 100 }, data: { label: 'P1' } },
            { id: 's2', type: 'start', position: { x: 50, y: 200 }, data: { label: 'P2' } },
            { id: 'm1', type: 'match', position: { x: 300, y: 150 }, data: { label: 'M', round: 1 } },
            { id: 'f1', type: 'final', position: { x: 600, y: 150 }, data: { label: 'F' } },
          ],
          edges: [
            { id: 'e1', source: 's1', target: 'm1', sourceHandle: 'output', targetHandle: 'input-1', type: 'smoothstep', data: { edgeType: 'participant' } },
            { id: 'e2', source: 's2', target: 'm1', sourceHandle: 'output', targetHandle: 'input-2', type: 'smoothstep', data: { edgeType: 'participant' } },
            { id: 'e3', source: 'm1', target: 'f1', sourceHandle: 'winner', targetHandle: 'input', type: 'smoothstep', data: { edgeType: 'winner' } },
          ],
        };

        await page.evaluate(async ({ id, schema, token }) => {
          await fetch(`/api/tournaments/${id}/custom-schema`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(schema),
          });
        }, { id: stageId, schema: schemaForStage, token: stageTok });

        const finStage = await page.evaluate(async ({ id, token }) => {
          const r = await fetch(`/api/tournaments/${id}/custom-finalize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          });
          return { status: r.status, body: await r.json().catch(() => ({})) };
        }, { id: stageId, token: stageTok });

        console.log(`Stage test finalize: ${finStage.status}`, JSON.stringify(finStage.body));

        if (finStage.status !== 200) {
          bug('critical',
            'Finalize fails: prisma.stage.findUnique({ where: { name: "Кастомная сетка" } }) — Stage.name is not @unique',
            '1. POST /api/tournaments/:id/custom-finalize',
            '200 OK',
            `Status ${finStage.status}: ${JSON.stringify(finStage.body)}. CAUSE: finalize uses Stage.findUnique({where:{name:...}}) but Stage.name is not @unique in the Prisma schema. Prisma's findUnique requires the field to be @unique.`);
        } else {
          console.log('Stage finalize succeeded despite missing @unique — maybe Stage has unique constraint anyway');
        }
      }
    }

    // ──────────────────────────────────────────────────────────
    // TEST 16: Access /tournaments/999999/custom-builder
    // ──────────────────────────────────────────────────────────
    console.log('\n=== TEST 16: Non-existent tournament /custom-builder ===');
    await page.goto(`${BASE_URL}/tournaments/999999/custom-builder`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);
    const s16 = await ss(page, '16-nonexistent');

    const body999 = await page.locator('body').textContent() || '';
    console.log(`Page body: ${body999.slice(0, 300)}`);
    const isStuck = /загрузк|loading/i.test(body999) && !/не найден|notFound|not found/i.test(body999);
    if (isStuck) {
      bug('medium',
        'Non-existent tournament custom-builder page shows infinite loading',
        'Navigate to /tournaments/999999/custom-builder',
        'Error message: "Турнир не найден"',
        'Page shows loading spinner with no error message',
        s16);
    } else {
      console.log('Non-existent tournament handled OK');
    }

    // ──────────────────────────────────────────────────────────
    // TEST 17: Unauthenticated access to builder
    // ──────────────────────────────────────────────────────────
    console.log('\n=== TEST 17: Unauthenticated access to builder ===');
    const anonCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const anonPage = await anonCtx.newPage();

    await anonPage.goto(`${BASE_URL}/tournaments/${tid}/custom-builder`);
    await anonPage.waitForLoadState('networkidle');
    await anonPage.waitForTimeout(2500);
    const s17 = await ss(anonPage, '17-anon-access');

    const anonBody = await anonPage.locator('body').textContent() || '';
    const canSeeCanvas = await anonPage.locator('.react-flow').count() > 0;
    const canUseToolbar = await anonPage.locator('aside button').count() > 0;
    console.log(`Anon: canvas=${canSeeCanvas}, toolbar=${canUseToolbar}, body excerpt: ${anonBody.slice(0, 200)}`);

    if (canSeeCanvas) {
      bug('critical',
        'Unauthenticated user can view/interact with custom builder canvas',
        '1. Unauthenticated browser\n2. Navigate to /tournaments/:id/custom-builder',
        'Access denied message or redirect to login',
        'ReactFlow canvas is visible without authentication',
        s17);
    } else {
      console.log('Anon access properly blocked');
    }

    await anonPage.close();
    await anonCtx.close();

    // ──────────────────────────────────────────────────────────
    // TEST 18: Page refresh — unsaved changes lost silently
    // ──────────────────────────────────────────────────────────
    console.log('\n=== TEST 18: Unsaved changes on refresh ===');
    const refreshTid = (await createCustomTournament(page)).tournament?.id;
    await page.goto(`${BASE_URL}/tournaments/${refreshTid}/custom-builder`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const pBtn3 = page.locator('aside button').filter({ hasText: /Участник/ }).first();
    await pBtn3.click(); await page.waitForTimeout(300);
    await pBtn3.click(); await page.waitForTimeout(300);
    const beforeCount = await page.locator('.react-flow__node').count();
    console.log(`Nodes before refresh: ${beforeCount}`);

    // Reload without save
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const afterCount = await page.locator('.react-flow__node').count();
    const s18 = await ss(page, '18-after-refresh');
    console.log(`Nodes after refresh (unsaved): ${afterCount}`);

    if (beforeCount > 0 && afterCount === 0) {
      bug('low',
        'No "unsaved changes" warning on page refresh/navigation',
        '1. Add nodes to builder canvas\n2. Press F5 / refresh without saving',
        'Browser shows beforeunload warning dialog',
        'Page refreshes silently; all unsaved nodes lost',
        s18);
    }

    // ──────────────────────────────────────────────────────────
    // TEST 19: Schema persisted — reload builder shows saved nodes
    // ──────────────────────────────────────────────────────────
    console.log('\n=== TEST 19: Saved schema persisted on reload ===');
    {
      const { tournament: persT, accessToken: persTok } = await createCustomTournament(page);
      const persTid = persT?.id;

      const persSchema = {
        nodes: [
          { id: 's1', type: 'start', position: { x: 50, y: 100 }, data: { label: 'P1' } },
          { id: 'f1', type: 'final', position: { x: 400, y: 100 }, data: { label: 'Победитель' } },
        ],
        edges: [],
      };

      await page.evaluate(async ({ id, schema, token }) => {
        await fetch(`/api/tournaments/${id}/custom-schema`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(schema),
        });
      }, { id: persTid, schema: persSchema, token: persTok });

      await page.goto(`${BASE_URL}/tournaments/${persTid}/custom-builder`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
      const s19 = await ss(page, '19-schema-persisted');

      const persistedNodes = await page.locator('.react-flow__node').count();
      console.log(`Nodes after reloading builder with saved schema: ${persistedNodes}`);

      if (persistedNodes === 0) {
        bug('high',
          'Saved schema not loaded/rendered on builder page reload',
          '1. Save a schema with nodes\n2. Navigate away\n3. Return to /custom-builder',
          'Previously saved nodes visible on canvas',
          'Canvas is empty despite schema being saved',
          s19);
      } else {
        console.log(`Schema persisted correctly: ${persistedNodes} nodes visible`);
      }
    }

    // ──────────────────────────────────────────────────────────
    // TEST 20: Backend API — empty schema bypass
    // ──────────────────────────────────────────────────────────
    console.log('\n=== TEST 20: Backend allows empty schema finalize ===');
    {
      const { tournament: emptyBT, accessToken: emptyBTok } = await createCustomTournament(page);
      const emptyBId = emptyBT?.id;

      const emptyS = await page.evaluate(async ({ id, token }) => {
        const r = await fetch(`/api/tournaments/${id}/custom-schema`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ nodes: [], edges: [] }),
        });
        return { status: r.status };
      }, { id: emptyBId, token: emptyBTok });

      console.log(`Empty schema POST: ${emptyS.status}`);

      const emptyFin = await page.evaluate(async ({ id, token }) => {
        const r = await fetch(`/api/tournaments/${id}/custom-finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        return { status: r.status, body: await r.json().catch(() => ({})) };
      }, { id: emptyBId, token: emptyBTok });

      console.log(`Empty schema finalize: ${emptyFin.status}`, JSON.stringify(emptyFin.body));

      if (emptyFin.status === 200) {
        bug('high',
          'Backend allows finalizing an empty schema (no validation on POST custom-schema)',
          '1. POST /custom-schema with {nodes:[],edges:[]}\n2. POST /custom-finalize',
          'Validation error preventing finalization of empty schema',
          `Both endpoints return 200 OK. Tournament becomes ACTIVE with 0 matches. This bypasses the frontend-only validation.`);
      } else {
        console.log('Empty schema finalize correctly rejected');
      }
    }

    // ──────────────────────────────────────────────────────────
    // TEST 21: i18n keys for custom builder
    // ──────────────────────────────────────────────────────────
    console.log('\n=== TEST 21: Missing i18n keys ===');
    {
      const ruJson = JSON.parse(fs.readFileSync(path.join('apps', 'web', 'src', 'i18n', 'ru.json'), 'utf-8'));
      const enJson = JSON.parse(fs.readFileSync(path.join('apps', 'web', 'src', 'i18n', 'en.json'), 'utf-8'));

      const requiredKeys = [
        'custom.builderTitle', 'custom.validationErrors', 'custom.schemaSaved',
        'custom.saveSchema', 'custom.addNode', 'custom.addMatch', 'custom.addGroup',
        'custom.addParticipant', 'custom.addFinal', 'custom.legend', 'custom.winnerEdge',
        'custom.loserEdge', 'custom.participantEdge', 'custom.handles', 'custom.handlesDesc',
        'custom.validationTitle',
      ];

      function checkKey(json, key) {
        const parts = key.split('.');
        let obj = json;
        for (const p of parts) { obj = obj?.[p]; }
        return obj !== undefined;
      }

      const missingRu = requiredKeys.filter(k => !checkKey(ruJson, k));
      const missingEn = requiredKeys.filter(k => !checkKey(enJson, k));

      console.log(`Missing ru.json keys: ${missingRu.length > 0 ? missingRu.join(', ') : 'none'}`);
      console.log(`Missing en.json keys: ${missingEn.length > 0 ? missingEn.join(', ') : 'none'}`);

      if (missingRu.length > 0) {
        bug('medium', 'Missing ru.json i18n keys for custom builder',
          'Check ru.json for custom.* keys',
          'All keys present',
          `Missing: ${missingRu.join(', ')} — these will render as key paths (e.g., "custom.builderTitle") in the UI`);
      }
      if (missingEn.length > 0) {
        bug('medium', 'Missing en.json i18n keys for custom builder',
          'Check en.json for custom.* keys',
          'All keys present',
          `Missing: ${missingEn.join(', ')}`);
      }
    }

    // ──────────────────────────────────────────────────────────
    // TEST 22: Can non-organizer (logged in as different user) access builder?
    // ──────────────────────────────────────────────────────────
    console.log('\n=== TEST 22: Non-organizer logged-in user access ===');
    {
      // Create a regular user via API
      const adminTok = await getToken(page);
      const testUserResp = await page.evaluate(async ({ token }) => {
        const login = 'qauser_' + Date.now();
        const r = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ login, email: `${login}@test.com`, password: 'test1234' }),
        });
        return { status: r.status, body: await r.json().catch(() => ({})) };
      }, { token: adminTok });

      console.log(`Test user created: ${testUserResp.status}`);

      if (testUserResp.status === 201 || testUserResp.status === 200) {
        const testUserToken = testUserResp.body?.accessToken;
        if (testUserToken) {
          // Try to save schema as non-organizer
          const nonOrgResp = await page.evaluate(async ({ id, token }) => {
            const r = await fetch(`/api/tournaments/${id}/custom-schema`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ nodes: [], edges: [] }),
            });
            return { status: r.status, body: await r.json().catch(() => ({})) };
          }, { id: tid, token: testUserToken });

          console.log(`Non-organizer schema save: ${nonOrgResp.status}`, JSON.stringify(nonOrgResp.body));

          if (nonOrgResp.status === 200) {
            bug('critical',
              'Non-organizer user can overwrite tournament custom schema',
              '1. Create a CUSTOM tournament as admin\n2. Try to POST /custom-schema as a different user',
              '403 Forbidden',
              `Status 200 OK — any logged-in user can overwrite custom schema`);
          } else {
            console.log('Non-organizer correctly blocked from saving schema OK');
          }

          // Also try to finalize as non-organizer
          const nonOrgFinalizeResp = await page.evaluate(async ({ id, token }) => {
            const r = await fetch(`/api/tournaments/${id}/custom-finalize`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            });
            return { status: r.status, body: await r.json().catch(() => ({})) };
          }, { id: tid, token: testUserToken });

          console.log(`Non-organizer finalize: ${nonOrgFinalizeResp.status}`, JSON.stringify(nonOrgFinalizeResp.body));

          if (nonOrgFinalizeResp.status === 200) {
            bug('critical',
              'Non-organizer user can finalize (launch) a custom tournament',
              '1. Create tournament as admin\n2. Save schema as admin\n3. POST /custom-finalize as different user',
              '403 Forbidden',
              `Status 200 OK`);
          } else {
            console.log('Non-organizer blocked from finalizing OK');
          }
        }
      }
    }

    // Final state screenshot
    await ss(page, '20-final');

    // Summary of console errors
    console.log(`\nConsole errors: ${consoleErrors.length}`);
    consoleErrors.slice(0, 10).forEach(e => console.log(`  [console error] ${e.slice(0, 250)}`));
    console.log(`Network errors (4xx/5xx): ${networkErrors.length}`);
    networkErrors.forEach(e => console.log(`  [net error] ${e}`));

  } catch (err) {
    console.error('\nFATAL TEST ERROR:', err.message);
    console.error(err.stack?.slice(0, 1000));
    await ss(page, 'fatal-exception').catch(() => {});
  } finally {
    await browser.close();
  }

  // ──────────────────────────────────────────────────────────
  // Print final report
  // ──────────────────────────────────────────────────────────
  console.log('\n\n' + '='.repeat(70));
  console.log('QA REPORT: CUSTOM TOURNAMENT FORMAT');
  console.log('='.repeat(70));

  if (bugs.length === 0) {
    console.log('\nAll tests passed. No bugs found.');
  } else {
    console.log(`\n${bugs.length} bug(s) found:\n`);
    bugs.forEach((b, i) => {
      console.log(`\n--- Bug #${i + 1} [${b.severity.toUpperCase()}] ---`);
      console.log(`Title: ${b.title}`);
      console.log(`Steps:\n${b.steps}`);
      console.log(`Expected: ${b.expected}`);
      console.log(`Actual: ${b.actual}`);
      if (b.screenshotPath) console.log(`Screenshot: ${b.screenshotPath}`);
    });
  }
}

run().catch(console.error);
