/**
 * QA UI Tests: CUSTOM Tournament Format Builder
 * Tests visual/interaction aspects using Playwright
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:5173';
const SCREENSHOTS_DIR = path.join('qa-screenshots', 'custom-ui');
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let ssIdx = 0;
async function ss(page, name) {
  const file = path.join(SCREENSHOTS_DIR, `${String(++ssIdx).padStart(3, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return path.resolve(file);
}

const bugs = [];
function bug(severity, title, steps, expected, actual, screenshot = null) {
  bugs.push({ severity, title, steps, expected, actual, screenshot });
  console.log(`\n[BUG/${severity.toUpperCase()}] ${title}`);
  console.log(`  Expected: ${expected}`);
  console.log(`  Actual:   ${actual}`);
  if (screenshot) console.log(`  Screenshot: ${screenshot}`);
}

async function loginAdmin(page) {
  await page.goto(`${BASE_URL}/`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  await page.locator('#login-username').fill('admin');
  await page.locator('#login-password').fill('admin123');
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForTimeout(2000);
}

async function createTournamentViaApi(page) {
  return page.evaluate(async () => {
    const r1 = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'admin', password: 'admin123' })
    });
    const { accessToken } = await r1.json();
    const r2 = await fetch('/api/tournaments', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + accessToken },
      body: JSON.stringify({ tournamentName: 'QA UI ' + Date.now(), gameName: 'Test', format: 'CUSTOM', maxParticipants: 8 })
    });
    const t = await r2.json();
    return { accessToken, tournament: t };
  });
}

async function saveSchema(page, tid, token, schema) {
  return page.evaluate(async ({ tid, token, schema }) => {
    const r = await fetch('/api/tournaments/' + tid + '/custom-schema', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(schema)
    });
    return { status: r.status, body: await r.json() };
  }, { tid, token, schema });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    // Login
    await loginAdmin(page);
    await ss(page, '01-login');

    // ─────────────────────────────────────────────────────────
    // UI TEST 1: Create CUSTOM tournament via UI form
    // ─────────────────────────────────────────────────────────
    console.log('\n=== UI TEST 1: Create CUSTOM tournament ===');
    await page.goto(`${BASE_URL}/tournaments/create`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Fill tournament name
    await page.locator('#name').fill('QA Custom Builder Test');

    // Find gameName input
    const allLabels = await page.locator('label').allTextContents();
    console.log('Labels on create form:', allLabels.join(' | '));

    const allInputIds = await page.locator('input').evaluateAll(els => els.map(e => e.id));
    console.log('Input IDs:', allInputIds.join(', '));

    // Find game input
    const gameInputs = page.locator('input').filter({ hasText: '' });
    // Second text input should be gameName
    const gameInput = page.locator('#game');
    await gameInput.fill('Dota 2');

    // Fill max participants
    const maxInput = page.locator('input[type="number"]').first();
    const maxVal = await maxInput.inputValue();
    if (!maxVal) await maxInput.fill('8');

    // Select CUSTOM format
    const formatTrigger = page.locator('#format');
    await formatTrigger.click();
    await page.waitForTimeout(400);
    const customOpt = page.locator('[role="option"]').filter({ hasText: /Кастом/i });
    if (await customOpt.count() > 0) {
      await customOpt.first().click();
      console.log('CUSTOM format selected');
    } else {
      const opts = await page.locator('[role="option"]').allTextContents();
      bug('critical', '"Кастомный" format missing from create form',
        'Open format dropdown on create form',
        '"Кастомный" option visible',
        `Options: ${opts.join(', ')}`);
      await page.keyboard.press('Escape');
    }

    await ss(page, '02-form-filled');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(3000);
    await page.waitForLoadState('networkidle');

    const createUrl = page.url();
    console.log('After create URL:', createUrl);
    const uiTid = createUrl.match(/\/tournaments\/(\d+)/)?.[1];

    if (!uiTid) {
      const errMsg = await page.locator('[class*="destructive"], [class*="error"]').textContent().catch(() => '');
      bug('high', 'Create CUSTOM tournament fails via UI',
        '1. Go to /tournaments/create\n2. Fill tournamentName, gameName="Dota 2", maxParticipants=8, format=CUSTOM\n3. Submit',
        'Redirect to /tournaments/:id',
        `URL: ${createUrl}. Error text: ${errMsg}`);
    } else {
      console.log(`Tournament created via UI: id=${uiTid}`);
    }

    // ─────────────────────────────────────────────────────────
    // UI TEST 2: "Открыть конструктор" button
    // ─────────────────────────────────────────────────────────
    console.log('\n=== UI TEST 2: "Открыть конструктор" on detail page ===');
    const { tournament: apiT, accessToken: tok } = await createTournamentViaApi(page);
    const tid = apiT.id;
    console.log(`API tournament: id=${tid}`);

    await page.goto(`${BASE_URL}/tournaments/${tid}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const builderLink = page.locator(`a[href="/tournaments/${tid}/custom-builder"]`);
    const btnCount = await builderLink.count();
    const ss2 = await ss(page, '03-detail-page');
    console.log('"Открыть конструктор" button count:', btnCount);

    if (btnCount === 0) {
      // Wider search
      const anyConst = await page.locator(':has-text("конструктор")').count();
      bug('critical', '"Открыть конструктор" button not on CUSTOM tournament detail',
        '1. Create CUSTOM tournament\n2. Go to detail page as organizer',
        'Link "Открыть конструктор" visible',
        `Not found. any "конструктор" text: ${anyConst}`,
        ss2);
    } else {
      console.log('"Открыть конструктор" OK');
    }

    // ─────────────────────────────────────────────────────────
    // UI TEST 3: Builder page layout
    // ─────────────────────────────────────────────────────────
    console.log('\n=== UI TEST 3: Builder page layout ===');
    await page.goto(`${BASE_URL}/tournaments/${tid}/custom-builder`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    const ss3 = await ss(page, '04-builder-initial');

    // ReactFlow
    const hasRF = await page.locator('.react-flow').count() > 0;
    console.log('ReactFlow canvas:', hasRF);
    if (!hasRF) {
      bug('critical', 'ReactFlow canvas not rendered', 'Navigate to /custom-builder', '.react-flow visible', 'Not found', ss3);
    }

    // Toolbar buttons (not in <aside>, in a div.w-48)
    const allBtns = await page.locator('button').allTextContents();
    console.log('All buttons:', allBtns.join(' | '));

    const hasMatchBtn = allBtns.some(t => /Матч/i.test(t));
    const hasGroupBtn = allBtns.some(t => /Группа/i.test(t));
    const hasPartBtn = allBtns.some(t => /Участник/i.test(t));
    const hasFinalBtn = allBtns.some(t => /Победитель|Финал/i.test(t));
    const hasSaveBtn = allBtns.some(t => /Сохранить/i.test(t));

    console.log(`Match=${hasMatchBtn} Group=${hasGroupBtn} Part=${hasPartBtn} Final=${hasFinalBtn} Save=${hasSaveBtn}`);

    if (!hasMatchBtn || !hasGroupBtn || !hasPartBtn || !hasFinalBtn) {
      bug('high', 'Toolbar buttons missing',
        'Open custom builder',
        'All 4 toolbar buttons visible',
        `Present: Match=${hasMatchBtn} Group=${hasGroupBtn} Part=${hasPartBtn} Final=${hasFinalBtn}`);
    }
    if (!hasSaveBtn) {
      bug('high', '"Сохранить схему" button not found in custom builder',
        'Open /custom-builder',
        'Save button in header',
        `Not found. Buttons: ${allBtns.join(', ')}`,
        ss3);
    }

    // ─────────────────────────────────────────────────────────
    // UI TEST 4: Add nodes
    // ─────────────────────────────────────────────────────────
    console.log('\n=== UI TEST 4: Add nodes via toolbar ===');

    // Add participant
    const partBtn = page.locator('button:has-text("Участник")').first();
    await partBtn.click(); await page.waitForTimeout(600);
    const after1 = await page.locator('.react-flow__node').count();

    // Add second participant
    await partBtn.click(); await page.waitForTimeout(600);
    const after2 = await page.locator('.react-flow__node').count();

    // Add match
    const matchBtn = page.locator('button:has-text("Матч")').first();
    await matchBtn.click(); await page.waitForTimeout(600);
    const after3 = await page.locator('.react-flow__node').count();

    // Add final
    const finalBtn = page.locator('button:has-text("Победитель")').first();
    await finalBtn.click(); await page.waitForTimeout(600);
    const after4 = await page.locator('.react-flow__node').count();

    const ss4 = await ss(page, '05-after-add-nodes');
    console.log(`Node counts: +P1=${after1} +P2=${after2} +M=${after3} +F=${after4}`);

    if (after1 === 0) bug('high', 'Participant node not appearing on canvas', 'Click "+ Участник"', 'Node on canvas', 'None', ss4);
    if (after3 <= after2) bug('high', 'Match node not appearing', 'Click "+ Матч"', 'Node added', 'Count unchanged');
    if (after4 <= after3) bug('high', 'Final node not appearing', 'Click "+ Победитель"', 'Node added', 'Count unchanged');

    // ─────────────────────────────────────────────────────────
    // UI TEST 5: Second Final blocked
    // ─────────────────────────────────────────────────────────
    console.log('\n=== UI TEST 5: Second Final blocked ===');
    {
      let alertMsg = null;
      page.once('dialog', async d => {
        alertMsg = d.message();
        console.log('Alert:', alertMsg);
        await d.accept();
      });
      await finalBtn.click();
      await page.waitForTimeout(800);
      const after5 = await page.locator('.react-flow__node').count();
      const ss5 = await ss(page, '06-second-final-attempt');

      if (!alertMsg) {
        const finalNodes = page.locator('.react-flow__node').filter({ hasText: /Победитель/ });
        const fc = await finalNodes.count();
        if (fc > 1) {
          bug('high', 'Second Final node added without blocking alert',
            'Click Финал twice',
            'Alert shown, second node blocked',
            `No alert, ${fc} final nodes visible`,
            ss5);
        } else {
          // Check if alert appears but we missed it (race condition)
          console.log('Second Final: no alert but count OK (block happened silently)');
          bug('low', 'Second Final node silently blocked — no user feedback via alert',
            '1. Add a Final node\n2. Click "+ Победитель" again',
            'Alert message shown: "Узел «Победитель» уже добавлен. Допускается только один."',
            'No dialog appeared. The click was blocked, but the user receives no visual/dialog feedback.',
            ss5);
        }
      } else {
        console.log('Second Final blocked with alert OK');
      }
    }

    // ─────────────────────────────────────────────────────────
    // UI TEST 6: Save empty — validation errors
    // ─────────────────────────────────────────────────────────
    console.log('\n=== UI TEST 6: Save empty canvas ===');
    const { tournament: emptyT } = await createTournamentViaApi(page);
    await page.goto(`${BASE_URL}/tournaments/${emptyT.id}/custom-builder`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const saveBtn = page.locator('button:has-text("Сохранить")').first();
    if (await saveBtn.count() > 0) {
      await saveBtn.click();
      await page.waitForTimeout(1000);
      const ss6 = await ss(page, '07-save-empty');

      const errTexts = await page.locator('[class*="destructive"]').allTextContents();
      console.log('Error texts:', errTexts.join(' || '));
      const hasErr = errTexts.some(t => /Победитель|подключён|ошибк|цикл/i.test(t));
      const headerErr = await page.locator('span').filter({ hasText: /ошибк/i }).count();
      console.log(`Has validation error: ${hasErr}, header count: ${headerErr}`);

      if (!hasErr && headerErr === 0) {
        bug('high', 'No validation errors when saving empty canvas',
          '1. Open fresh custom-builder\n2. Click "Сохранить схему" with no nodes',
          'Validation error messages displayed',
          'No error shown',
          ss6);
      } else {
        console.log('Empty canvas validation error shown OK');
      }
    }

    // ─────────────────────────────────────────────────────────
    // UI TEST 7: Save with unconnected StartNodes
    // ─────────────────────────────────────────────────────────
    console.log('\n=== UI TEST 7: Save with unconnected nodes ===');
    {
      const { tournament: disconnT } = await createTournamentViaApi(page);
      await page.goto(`${BASE_URL}/tournaments/${disconnT.id}/custom-builder`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const pb = page.locator('button:has-text("Участник")').first();
      await pb.click(); await page.waitForTimeout(300);
      await pb.click(); await page.waitForTimeout(300);
      const fb = page.locator('button:has-text("Победитель")').first();
      await fb.click(); await page.waitForTimeout(300);

      const sb = page.locator('button:has-text("Сохранить")').first();
      await sb.click();
      await page.waitForTimeout(1000);
      const ss7 = await ss(page, '08-save-disconnected');

      const errItems = await page.locator('li').filter({ hasText: /не подключён/i }).count();
      const anyErr = await page.locator('[class*="destructive"]').allTextContents();
      console.log(`"не подключён" errors: ${errItems}, all destructive: ${anyErr.join(' | ')}`);

      if (errItems === 0 && !anyErr.some(t => /подключён|Победитель/i.test(t))) {
        bug('high', 'No "not connected" validation error for disconnected StartNodes',
          '1. Add 2 participants + 1 Final, no connections\n2. Save',
          '"Участник не подключён" errors shown',
          'No such error',
          ss7);
      } else {
        console.log('Disconnected validation OK');
      }
    }

    // ─────────────────────────────────────────────────────────
    // UI TEST 8: "Запустить турнир" button after schema saved
    // ─────────────────────────────────────────────────────────
    console.log('\n=== UI TEST 8: Launch button after schema save ===');
    {
      const { tournament: savedT, accessToken: savedTok } = await createTournamentViaApi(page);
      const schema = {
        nodes: [
          { id: 's1', type: 'start', position: { x: 50, y: 100 }, data: { label: 'P1' } },
          { id: 's2', type: 'start', position: { x: 50, y: 200 }, data: { label: 'P2' } },
          { id: 'm1', type: 'match', position: { x: 300, y: 150 }, data: { label: 'Match' } },
          { id: 'f1', type: 'final', position: { x: 600, y: 150 }, data: { label: 'Winner' } },
        ],
        edges: [
          { id: 'e1', source: 's1', target: 'm1', sourceHandle: 'output', targetHandle: 'input-1', type: 'smoothstep', data: { edgeType: 'participant' } },
          { id: 'e2', source: 's2', target: 'm1', sourceHandle: 'output', targetHandle: 'input-2', type: 'smoothstep', data: { edgeType: 'participant' } },
          { id: 'e3', source: 'm1', target: 'f1', sourceHandle: 'winner', targetHandle: 'input', type: 'smoothstep', data: { edgeType: 'winner' } },
        ],
      };
      await saveSchema(page, savedT.id, savedTok, schema);

      await page.goto(`${BASE_URL}/tournaments/${savedT.id}/custom-builder`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
      const ss8 = await ss(page, '09-builder-with-schema');

      const launchBtn = page.locator('button:has-text("Запустить")');
      const lCount = await launchBtn.count();
      console.log('"Запустить" button count:', lCount);

      const allBtns2 = await page.locator('button').allTextContents();
      console.log('All buttons when schema saved:', allBtns2.join(' | '));

      if (lCount === 0) {
        bug('critical', '"Запустить турнир" button not appearing after schema is saved',
          '1. Save valid custom schema via API\n2. Navigate to /custom-builder',
          '"Запустить турнир" button visible in header',
          `Not found. All buttons: ${allBtns2.join(', ')}`,
          ss8);
      } else {
        console.log('"Запустить" button found OK');
      }

      // Also verify schema-loaded nodes appear
      const loadedNodes = await page.locator('.react-flow__node').count();
      console.log('Loaded nodes from saved schema:', loadedNodes);
      if (loadedNodes === 0) {
        bug('high', 'Saved schema nodes not rendered when reopening builder',
          '1. Save schema with 4 nodes\n2. Navigate away\n3. Return to /custom-builder',
          'Previously saved nodes visible on canvas',
          'Canvas is empty',
          ss8);
      }
    }

    // ─────────────────────────────────────────────────────────
    // UI TEST 9: Launch modal/confirmation and finalize
    // ─────────────────────────────────────────────────────────
    console.log('\n=== UI TEST 9: Launch tournament from builder ===');
    {
      const { tournament: finT, accessToken: finTok } = await createTournamentViaApi(page);
      const schema = {
        nodes: [
          { id: 's1', type: 'start', position: { x: 50, y: 100 }, data: { label: 'P1' } },
          { id: 's2', type: 'start', position: { x: 50, y: 200 }, data: { label: 'P2' } },
          { id: 'm1', type: 'match', position: { x: 300, y: 150 }, data: { label: 'Match' } },
          { id: 'f1', type: 'final', position: { x: 600, y: 150 }, data: { label: 'Winner' } },
        ],
        edges: [
          { id: 'e1', source: 's1', target: 'm1', sourceHandle: 'output', targetHandle: 'input-1', type: 'smoothstep', data: { edgeType: 'participant' } },
          { id: 'e2', source: 's2', target: 'm1', sourceHandle: 'output', targetHandle: 'input-2', type: 'smoothstep', data: { edgeType: 'participant' } },
          { id: 'e3', source: 'm1', target: 'f1', sourceHandle: 'winner', targetHandle: 'input', type: 'smoothstep', data: { edgeType: 'winner' } },
        ],
      };
      await saveSchema(page, finT.id, finTok, schema);

      await page.goto(`${BASE_URL}/tournaments/${finT.id}/custom-builder`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      const launchBtn = page.locator('button:has-text("Запустить")').first();
      if (await launchBtn.count() > 0) {
        // Set up dialog handler for confirm()
        page.once('dialog', async d => {
          console.log('Launch confirm dialog:', d.message());
          await d.accept();
        });
        await launchBtn.click();
        await page.waitForTimeout(3000);
        await page.waitForLoadState('networkidle');
        const afterFinUrl = page.url();
        console.log('URL after launching:', afterFinUrl);
        const ss9 = await ss(page, '10-after-launch');

        if (afterFinUrl.includes('/custom-builder')) {
          // Still on builder page — something went wrong
          bug('high', 'After clicking "Запустить турнир" + confirming, page stays on builder',
            '1. Save schema\n2. Click "Запустить турнир"\n3. Accept confirm dialog',
            'Redirect to /tournaments/:id (tournament detail)',
            `URL: ${afterFinUrl}`,
            ss9);
        } else {
          console.log('Launch redirected to:', afterFinUrl);
        }
      }
    }

    // ─────────────────────────────────────────────────────────
    // UI TEST 10: Non-existent tournament /custom-builder
    // ─────────────────────────────────────────────────────────
    console.log('\n=== UI TEST 10: Non-existent tournament ===');
    await page.goto(`${BASE_URL}/tournaments/999999/custom-builder`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);
    const ss10 = await ss(page, '11-nonexistent');

    const bodyText = await page.locator('body').textContent() || '';
    console.log('Body excerpt:', bodyText.slice(0, 300));
    const isLoading = /загрузк|loading/i.test(bodyText) && !/не найден|notFound/i.test(bodyText);
    const isNotFound = /не найден|notFound/i.test(bodyText);
    console.log(`Loading: ${isLoading}, NotFound: ${isNotFound}`);

    if (isLoading) {
      bug('medium', 'Non-existent tournament /custom-builder shows infinite loading',
        'Navigate to /tournaments/999999/custom-builder',
        '"Турнир не найден" error message',
        'Stuck in loading state',
        ss10);
    } else if (isNotFound) {
      console.log('Non-existent tournament shows error OK');
    }

    // ─────────────────────────────────────────────────────────
    // UI TEST 11: Non-auth user access
    // ─────────────────────────────────────────────────────────
    console.log('\n=== UI TEST 11: Unauthenticated access ===');
    const anonCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const anonPage = await anonCtx.newPage();

    await anonPage.goto(`${BASE_URL}/tournaments/${tid}/custom-builder`);
    await anonPage.waitForLoadState('networkidle');
    await anonPage.waitForTimeout(2500);
    const ss11 = await ss(anonPage, '12-anon-access');

    const anonCanvas = await anonPage.locator('.react-flow').count() > 0;
    const anonBtns = await anonPage.locator('button:has-text("Матч")').count();
    const anonBody = await anonPage.locator('body').textContent() || '';
    console.log(`Anon: canvas=${anonCanvas}, match-btn=${anonBtns}`);
    console.log('Anon body:', anonBody.slice(0, 200));

    if (anonCanvas) {
      bug('critical', 'Unauthenticated user can view custom builder canvas',
        'No login, navigate to /tournaments/:id/custom-builder',
        'Access denied or redirect to login',
        'Canvas visible without auth',
        ss11);
    } else {
      console.log('Anon access blocked OK');
    }

    await anonPage.close();
    await anonCtx.close();

    // ─────────────────────────────────────────────────────────
    // UI TEST 12: CUSTOM tournament detail — no builder button if ACTIVE
    // ─────────────────────────────────────────────────────────
    console.log('\n=== UI TEST 12: No builder button for ACTIVE tournament ===');
    {
      // Create and finalize a tournament to make it ACTIVE
      const { tournament: activeT, accessToken: activeTok } = await createTournamentViaApi(page);
      const activeSchema = {
        nodes: [
          { id: 's1', type: 'start', position: { x: 50, y: 100 }, data: { label: 'P1' } },
          { id: 's2', type: 'start', position: { x: 50, y: 200 }, data: { label: 'P2' } },
          { id: 'm1', type: 'match', position: { x: 300, y: 150 }, data: { label: 'M' } },
          { id: 'f1', type: 'final', position: { x: 600, y: 150 }, data: { label: 'F' } },
        ],
        edges: [
          { id: 'e1', source: 's1', target: 'm1', sourceHandle: 'output', targetHandle: 'input-1', type: 'smoothstep', data: { edgeType: 'participant' } },
          { id: 'e2', source: 's2', target: 'm1', sourceHandle: 'output', targetHandle: 'input-2', type: 'smoothstep', data: { edgeType: 'participant' } },
          { id: 'e3', source: 'm1', target: 'f1', sourceHandle: 'winner', targetHandle: 'input', type: 'smoothstep', data: { edgeType: 'winner' } },
        ],
      };
      await saveSchema(page, activeT.id, activeTok, activeSchema);

      await page.evaluate(async ({ id, token }) => {
        await fetch('/api/tournaments/' + id + '/custom-finalize', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }
        });
      }, { id: activeT.id, token: activeTok });

      await page.goto(`${BASE_URL}/tournaments/${activeT.id}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      const ss12 = await ss(page, '13-active-detail');

      const builderBtnActive = await page.locator(`a[href="/tournaments/${activeT.id}/custom-builder"]`).count();
      console.log(`Builder button on ACTIVE tournament: ${builderBtnActive}`);

      if (builderBtnActive > 0) {
        bug('medium', '"Открыть конструктор" button visible on ACTIVE tournament (after launch)',
          '1. Create and finalize CUSTOM tournament\n2. Go to detail page (status=ACTIVE)',
          'Builder button hidden for ACTIVE tournaments',
          'Builder button still visible. Clicking it would allow editing an already-running tournament.',
          ss12);
      } else {
        console.log('Builder button correctly hidden for ACTIVE tournament');
      }
    }

    // ─────────────────────────────────────────────────────────
    // UI TEST 13: Group node size clamping
    // ─────────────────────────────────────────────────────────
    console.log('\n=== UI TEST 13: Group node size handling ===');
    const { tournament: groupT } = await createTournamentViaApi(page);
    await page.goto(`${BASE_URL}/tournaments/${groupT.id}/custom-builder`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const groupBtn = page.locator('button:has-text("Группа")').first();
    if (await groupBtn.count() > 0) {
      // Test with size=0 (below min=2)
      page.once('dialog', async d => {
        console.log('Group prompt:', d.message());
        await d.accept('0');
      });
      await groupBtn.click();
      await page.waitForTimeout(500);

      // Test with size=100 (above max=8)
      page.once('dialog', async d => {
        await d.accept('100');
      });
      await groupBtn.click();
      await page.waitForTimeout(500);

      const ss13 = await ss(page, '14-group-nodes');
      const groupNodes = await page.locator('.react-flow__node').filter({ hasText: /Группа/ }).count();
      console.log(`Group nodes after size=0 and size=100: ${groupNodes}`);
    }

    // ─────────────────────────────────────────────────────────
    // UI TEST 14: i18n keys check
    // ─────────────────────────────────────────────────────────
    console.log('\n=== UI TEST 14: i18n key check ===');
    const ruJson = JSON.parse(fs.readFileSync(path.join('apps', 'web', 'src', 'i18n', 'ru.json'), 'utf-8'));
    const enJson = JSON.parse(fs.readFileSync(path.join('apps', 'web', 'src', 'i18n', 'en.json'), 'utf-8'));

    const keys = [
      'custom.builderTitle', 'custom.validationErrors', 'custom.schemaSaved',
      'custom.saveSchema', 'custom.addNode', 'custom.addMatch', 'custom.addGroup',
      'custom.addParticipant', 'custom.addFinal', 'custom.legend',
      'custom.winnerEdge', 'custom.loserEdge', 'custom.participantEdge',
      'custom.handles', 'custom.handlesDesc', 'custom.validationTitle',
    ];

    function lookup(json, key) {
      return key.split('.').reduce((obj, p) => obj?.[p], json) !== undefined;
    }

    const missingRu = keys.filter(k => !lookup(ruJson, k));
    const missingEn = keys.filter(k => !lookup(enJson, k));
    console.log(`Missing ru.json: ${missingRu.length > 0 ? missingRu.join(', ') : 'none'}`);
    console.log(`Missing en.json: ${missingEn.length > 0 ? missingEn.join(', ') : 'none'}`);

    if (missingRu.length > 0) {
      bug('medium', 'Missing ru.json i18n keys for custom builder',
        'Check /custom-builder page in Russian locale',
        'All UI text displayed correctly',
        `Missing keys: ${missingRu.join(', ')} → these render as "custom.builderTitle" etc. in UI`);
    }
    if (missingEn.length > 0) {
      bug('medium', 'Missing en.json i18n keys for custom builder',
        'Switch to English locale, open /custom-builder',
        'All text rendered correctly',
        `Missing: ${missingEn.join(', ')}`);
    }

    // Final screenshot
    await ss(page, '15-final');

    // Console errors
    console.log(`\nConsole errors: ${consoleErrors.length}`);
    consoleErrors.slice(0, 10).forEach(e => console.log('  ERROR:', e.slice(0, 200)));

  } catch (err) {
    console.error('\nFATAL:', err.message);
    await ss(page, 'fatal').catch(() => {});
  } finally {
    await browser.close();
  }

  // ─────────────────────────────────────────────────────────
  // Print Report
  // ─────────────────────────────────────────────────────────
  console.log('\n\n' + '='.repeat(70));
  console.log('QA UI REPORT: CUSTOM TOURNAMENT BUILDER');
  console.log('='.repeat(70));
  if (bugs.length === 0) {
    console.log('\nAll tests passed.');
  } else {
    console.log(`\n${bugs.length} bug(s):`);
    bugs.forEach((b, i) => {
      console.log(`\n--- Bug #${i+1} [${b.severity.toUpperCase()}] ---`);
      console.log(`Title: ${b.title}`);
      console.log(`Steps:\n${b.steps}`);
      console.log(`Expected: ${b.expected}`);
      console.log(`Actual: ${b.actual}`);
      if (b.screenshot) console.log(`Screenshot: ${b.screenshot}`);
    });
  }
}

run().catch(console.error);
