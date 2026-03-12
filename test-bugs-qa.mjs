import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const OUT = 'C:/Users/mathyber/AppData/Local/Temp/qa-verify';
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5173';
const API  = 'http://localhost:3001';

// Helper: login as admin
async function loginAsAdmin(page) {
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  // Try to fill login fields
  const textInputs = await page.$$('input[type="text"], input:not([type])');
  const passInputs = await page.$$('input[type="password"]');
  if (textInputs.length > 0) await textInputs[0].fill('admin');
  if (passInputs.length > 0) await passInputs[0].fill('admin123');
  await page.click('button[type="submit"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

// Helper: find an active tournament via API
async function findActiveTournament() {
  const resp = await fetch(`${API}/api/tournaments?limit=50`);
  const data = await resp.json();
  const tournaments = data.data ?? data.tournaments ?? (Array.isArray(data) ? data : []);
  const se = tournaments.find(t => t.format === 'SINGLE_ELIMINATION' && t.status === 'ACTIVE');
  if (se) return se;
  const any = tournaments.find(t => t.status === 'ACTIVE');
  if (any) return any;
  return tournaments[0];
}

async function main() {
  const results = {};
  const browser = await chromium.launch({ headless: true });

  try {
    console.log('Finding tournament...');
    const tournament = await findActiveTournament();
    if (!tournament) {
      console.error('No tournament found!');
      process.exit(1);
    }
    console.log(`Tournament: "${tournament.name}" id=${tournament.id} format=${tournament.format} status=${tournament.status}`);

    // ─── BUG #1: Bracket page title ───────────────────────────────────────────
    console.log('\n=== BUG #1: Bracket page title ===');
    {
      // Admin session
      const page = await browser.newPage();
      await loginAsAdmin(page);
      await page.goto(`${BASE}/tournaments/${tournament.id}/bracket`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2500);
      const title1 = await page.textContent('h1').catch(() => null);
      console.log(`Admin h1: "${title1}"`);
      await page.screenshot({ path: `${OUT}/bug1-admin-title.png` });

      // Guest (unauthenticated) session
      const page2 = await browser.newPage();
      await page2.goto(`${BASE}/tournaments/${tournament.id}/bracket`);
      await page2.waitForLoadState('networkidle');
      await page2.waitForTimeout(2500);
      const title2 = await page2.textContent('h1').catch(() => null);
      console.log(`Guest h1: "${title2}"`);
      await page2.screenshot({ path: `${OUT}/bug1-guest-title.png` });

      const adminOk = !!(title1 && title1.includes('Редактор сетки'));
      const guestOk = !!(title2 && (title2.includes('Турнирная сетка') || !title2.includes('Редактор')));

      results['Bug #1'] = {
        pass: adminOk && guestOk,
        adminTitle: title1,
        guestTitle: title2,
        adminOk, guestOk,
        screenshots: ['bug1-admin-title.png', 'bug1-guest-title.png'],
      };
      await page.close();
      await page2.close();
    }

    // ─── BUG #2: Round labels on bracket ──────────────────────────────────────
    console.log('\n=== BUG #2: Round labels on bracket ===');
    {
      const page = await browser.newPage();
      await loginAsAdmin(page);
      await page.goto(`${BASE}/tournaments/${tournament.id}/bracket`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(4000); // ReactFlow takes time

      // LabelNode renders in a .react-flow__node-label container
      const labelNodes = await page.$$('.react-flow__node-label');
      const labelTexts = await Promise.all(labelNodes.map(n => n.textContent()));
      console.log(`Found ${labelNodes.length} label nodes: ${JSON.stringify(labelTexts)}`);

      // Also look at ALL node data-ids to see if label- prefixed ones exist
      const allDataIds = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.react-flow__node')).map(n => n.getAttribute('data-id'));
      });
      const labelIds = allDataIds.filter(id => id && id.startsWith('label-'));
      console.log(`Node data-ids starting with 'label-': ${JSON.stringify(labelIds)}`);

      // Check match data from API to see if stages are named
      const gridResp = await fetch(`${API}/api/tournaments/${tournament.id}/grid`);
      const gridData = await gridResp.json();
      const matches = gridData.matches ?? [];
      const stageNames = [...new Set(matches.map(m => m.stage?.name).filter(Boolean))];
      console.log(`Stage names in API data: ${JSON.stringify(stageNames)}`);

      await page.screenshot({ path: `${OUT}/bug2-round-labels.png`, fullPage: true });

      results['Bug #2'] = {
        pass: labelNodes.length > 0,
        labelCount: labelNodes.length,
        labelTexts,
        labelIds,
        stageNames,
        screenshots: ['bug2-round-labels.png'],
      };
      await page.close();
    }

    // ─── BUG #3: Clicking match navigates ─────────────────────────────────────
    console.log('\n=== BUG #3: Clicking match navigates ===');
    {
      const page = await browser.newPage();
      await loginAsAdmin(page);
      await page.goto(`${BASE}/tournaments/${tournament.id}/bracket`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(4000);

      const matchNodes = await page.$$('.react-flow__node-match');
      console.log(`Found ${matchNodes.length} match nodes in bracket`);

      if (matchNodes.length > 0) {
        const urlBefore = page.url();
        // Click the first match node
        await matchNodes[0].click({ force: true });
        await page.waitForTimeout(2000);
        const urlAfter = page.url();
        console.log(`URL before click: ${urlBefore}`);
        console.log(`URL after click: ${urlAfter}`);
        const navigated = urlAfter.includes('/matches/');
        await page.screenshot({ path: `${OUT}/bug3-after-click.png` });
        results['Bug #3'] = {
          pass: navigated,
          urlBefore, urlAfter,
          screenshots: ['bug3-after-click.png'],
        };
      } else {
        await page.screenshot({ path: `${OUT}/bug3-no-matches.png`, fullPage: true });
        results['Bug #3'] = {
          pass: null,
          details: 'No match nodes found in bracket',
          screenshots: ['bug3-no-matches.png'],
        };
      }
      await page.close();
    }

    // ─── BUG #4: isFinal defaults to ON for organizer ─────────────────────────
    console.log('\n=== BUG #4: isFinal defaults to ON for organizer ===');
    {
      const matchResp = await fetch(`${API}/api/tournaments/${tournament.id}/matches`);
      const matchData = await matchResp.json();
      const matches = matchData.matches ?? matchData.data ?? (Array.isArray(matchData) ? matchData : []);
      console.log(`Tournament has ${matches.length} matches`);

      const activeMatch = matches.find(m => !m.isFinished && !m.isBye && m.player1Id && m.player2Id);
      console.log(`Active match: ${activeMatch ? `id=${activeMatch.id}` : 'none'}`);

      if (activeMatch) {
        const page = await browser.newPage();
        await loginAsAdmin(page);
        await page.goto(`${BASE}/matches/${activeMatch.id}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2500);

        // The switch has id="is-final"
        // radix-ui Switch renders as <button role="switch" id="is-final" data-state="checked|unchecked" aria-checked="true|false">
        const switchEl = await page.$('[id="is-final"]');
        let isFinalChecked = null;
        let switchInfo = {};

        if (switchEl) {
          const ariaChecked = await switchEl.getAttribute('aria-checked');
          const dataState = await switchEl.getAttribute('data-state');
          const tagName = await switchEl.evaluate(el => el.tagName);
          isFinalChecked = ariaChecked === 'true' || dataState === 'checked';
          switchInfo = { tagName, ariaChecked, dataState };
          console.log(`Switch: tag=${tagName} aria-checked=${ariaChecked} data-state=${dataState}`);
        } else {
          console.log('Switch element with id="is-final" not found');
          // List all switch elements
          const allSwitches = await page.$$('[role="switch"]');
          for (const sw of allSwitches) {
            const info = await sw.evaluate(el => ({
              id: el.id,
              ariaChecked: el.getAttribute('aria-checked'),
              dataState: el.getAttribute('data-state'),
              text: el.textContent?.trim(),
            }));
            console.log('Found switch:', info);
          }
        }

        await page.screenshot({ path: `${OUT}/bug4-isfinal-toggle.png` });

        results['Bug #4'] = {
          pass: isFinalChecked === true,
          isFinalChecked,
          switchInfo,
          matchId: activeMatch.id,
          screenshots: ['bug4-isfinal-toggle.png'],
        };
        await page.close();
      } else {
        results['Bug #4'] = {
          pass: null,
          details: 'No active unfinished match with 2 players found',
        };
      }
    }

    // ─── Summary ───────────────────────────────────────────────────────────────
    console.log('\n\n============================');
    console.log('QA RESULTS SUMMARY');
    console.log('============================');
    for (const [bug, result] of Object.entries(results)) {
      const status = result.pass === null ? '⚠️  SKIP' : result.pass ? '✅ PASS' : '❌ FAIL';
      console.log(`\n${bug}: ${status}`);
      const { pass, screenshots, ...rest } = result;
      console.log('  Details:', JSON.stringify(rest, null, 2).replace(/\n/g, '\n  '));
    }

    writeFileSync(`${OUT}/summary.json`, JSON.stringify({ tournament, results }, null, 2));
    console.log(`\nSaved to ${OUT}/summary.json`);

  } finally {
    await browser.close();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
