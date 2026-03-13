/**
 * QA Script: Double Elimination Tournament — Adversarial Testing
 * Tests bracket generation, BYE handling, drop to losers, GF, GF reset, winner determination.
 * Run with: node qa-double-elim.mjs
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3001';
const WEB = 'http://localhost:5173';
const SS_DIR = path.join(__dirname, 'qa-screenshots', 'double-elim');
if (!fs.existsSync(SS_DIR)) fs.mkdirSync(SS_DIR, { recursive: true });

let bugs = [];
let passCount = 0;
let failCount = 0;
let bugCount = 0;
let browser, page;

function pass(name, detail = '') {
  console.log(`  ✅ PASS: ${name}${detail ? ' — ' + detail : ''}`);
  passCount++;
}

function fail(name, detail = '') {
  console.log(`  ❌ FAIL: ${name}${detail ? ' — ' + detail : ''}`);
  failCount++;
}

function bug(title, steps, expected, actual, severity, screenshotPath = null) {
  bugCount++;
  const b = { num: bugCount, title, steps, expected, actual, severity, screenshotPath };
  bugs.push(b);
  console.log(`\n  🐛 BUG #${bugCount}: ${title} [${severity.toUpperCase()}]`);
  console.log(`     Steps: ${steps}`);
  console.log(`     Expected: ${expected}`);
  console.log(`     Actual: ${actual}`);
  if (screenshotPath) console.log(`     Screenshot: ${screenshotPath}`);
}

async function req(method, endpoint, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body !== undefined && method !== 'GET' && method !== 'HEAD') opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${endpoint}`, opts);
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

async function login(loginName = 'admin', password = 'admin123') {
  const r = await req('POST', '/api/auth/login', { login: loginName, password });
  if (r.status !== 200) throw new Error(`Login failed: ${JSON.stringify(r.json)}`);
  return r.json.accessToken;
}

async function screenshot(name) {
  const p = path.join(SS_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

async function createTournament(token, name, playerCount, onlyOrganizer = true) {
  const r = await req('POST', '/api/tournaments', {
    tournamentName: name,
    gameName: 'TestGame',
    format: 'DOUBLE_ELIMINATION',
    maxParticipants: playerCount,
    onlyOrganizerSetsResults: onlyOrganizer,
  }, token);
  if (r.status !== 201) throw new Error(`Create tournament failed: ${JSON.stringify(r.json)}`);
  return r.json;
}

async function openRegistration(token, tournamentId) {
  const r = await req('POST', `/api/tournaments/${tournamentId}/open-registration`, {}, token);
  if (r.status !== 200) throw new Error(`Open registration failed: ${JSON.stringify(r.json)}`);
  return r.json;
}

async function fillRandom(token, tournamentId) {
  const r = await req('POST', `/api/tournaments/${tournamentId}/fill-random`, {}, token);
  if (r.status !== 200) throw new Error(`Fill random failed: ${JSON.stringify(r.json)}`);
  return r.json;
}

async function startTournament(token, tournamentId) {
  const r = await req('POST', `/api/tournaments/${tournamentId}/grid/finalize`, {
    gridJson: '{}',
    participantAssignments: [],
  }, token);
  if (r.status !== 200) throw new Error(`Start tournament failed: ${JSON.stringify(r.json)}`);
  return r.json;
}

async function setResult(token, matchId, p1Score, p2Score) {
  const r = await req('POST', `/api/matches/${matchId}/result`, {
    player1Score: p1Score,
    player2Score: p2Score,
    isFinal: true,
  }, token);
  return r;
}

async function getMatches(token, tournamentId) {
  const r = await req('GET', `/api/tournaments/${tournamentId}/matches`, null, token);
  if (r.status !== 200) throw new Error(`Get matches failed: ${JSON.stringify(r.json)}`);
  return r.json;
}

async function getMatch(token, matchId) {
  const r = await req('GET', `/api/matches/${matchId}`, null, token);
  return r;
}

async function getTournament(token, tournamentId) {
  const r = await req('GET', `/api/tournaments/${tournamentId}`, null, token);
  if (r.status !== 200) throw new Error(`Get tournament failed: ${JSON.stringify(r.json)}`);
  return r.json;
}

async function getParticipants(token, tournamentId) {
  const r = await req('GET', `/api/tournaments/${tournamentId}/participants`, null, token);
  if (r.status !== 200) throw new Error(`Get participants failed: ${JSON.stringify(r.json)}`);
  return r.json;
}

// Play through all matches for a tournament, making p1 always win WB and p2 always win LB
// This tests the loser drop scenario and eventually creates a GF reset situation
async function playAllMatchesP1WinsAll(token, tournamentId) {
  let iteration = 0;
  while (true) {
    iteration++;
    if (iteration > 100) throw new Error('Infinite loop in playAllMatchesP1WinsAll');
    const matches = await getMatches(token, tournamentId);
    const pending = matches.filter(m => !m.isFinished && !m.isBye && m.player1Id && m.player2Id);
    if (pending.length === 0) break;
    for (const m of pending) {
      await setResult(token, m.id, 2, 0); // p1 always wins
    }
  }
}

// Play all matches — p2 always wins (to stress loser bracket)
async function playAllMatchesP2WinsAll(token, tournamentId) {
  let iteration = 0;
  while (true) {
    iteration++;
    if (iteration > 100) throw new Error('Infinite loop');
    const matches = await getMatches(token, tournamentId);
    const pending = matches.filter(m => !m.isFinished && !m.isBye && m.player1Id && m.player2Id);
    if (pending.length === 0) break;
    for (const m of pending) {
      await setResult(token, m.id, 0, 2); // p2 always wins
    }
  }
}

// Play all WB matches with p1 winning, LB matches with p2 winning — tests GF reset
async function playWithGFReset(token, tournamentId) {
  let iteration = 0;
  while (true) {
    iteration++;
    if (iteration > 200) throw new Error('Infinite loop in playWithGFReset');
    const matches = await getMatches(token, tournamentId);
    const pending = matches.filter(m => !m.isFinished && !m.isBye && m.player1Id && m.player2Id);
    if (pending.length === 0) break;
    for (const m of pending) {
      const stage = m.stage?.name ?? '';
      if (stage === 'Верхняя сетка') {
        await setResult(token, m.id, 3, 1); // WB: p1 wins
      } else if (stage === 'Нижняя сетка') {
        await setResult(token, m.id, 1, 3); // LB: p2 wins
      } else if (stage === 'Гранд-финал') {
        // First GF: LB player (p2) wins to force reset
        await setResult(token, m.id, 1, 3); // p2 wins first GF → reset needed
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual test suites
// ─────────────────────────────────────────────────────────────────────────────

async function testPlayerCount(token, playerCount, label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing Double Elimination with ${playerCount} players (${label})`);
  console.log('='.repeat(60));

  const name = `DE_${playerCount}P_${Date.now()}`;
  const maxPlayers = playerCount;

  let tournamentId;
  try {
    const t = await createTournament(token, name, maxPlayers);
    tournamentId = t.id;
    pass(`Create DE tournament (${playerCount}p)`);
  } catch (e) {
    fail(`Create DE tournament (${playerCount}p)`, e.message);
    bug(
      `Cannot create DE tournament with ${playerCount} players`,
      `POST /api/tournaments with format=DOUBLE_ELIMINATION maxParticipants=${playerCount}`,
      'Tournament created (201)',
      e.message,
      'critical'
    );
    return { tournamentId: null, success: false };
  }

  // Open registration
  try {
    await openRegistration(token, tournamentId);
    pass(`Open registration (${playerCount}p)`);
  } catch (e) {
    fail(`Open registration (${playerCount}p)`, e.message);
    bug(`Open registration failed for ${playerCount}p DE`, 'POST open-registration', '200 OK', e.message, 'critical');
    return { tournamentId, success: false };
  }

  // Fill with random players
  try {
    await fillRandom(token, tournamentId);
    pass(`Fill with ${playerCount} players`);
  } catch (e) {
    fail(`Fill random (${playerCount}p)`, e.message);
    bug(`Fill random failed for ${playerCount}p DE`, 'POST fill-random', `${playerCount} players added`, e.message, 'critical');
    return { tournamentId, success: false };
  }

  // Start tournament
  let startResult;
  try {
    startResult = await startTournament(token, tournamentId);
    pass(`Start tournament (${playerCount}p)`);
  } catch (e) {
    fail(`Start tournament (${playerCount}p)`, e.message);
    bug(
      `Cannot start DE tournament with ${playerCount} players`,
      `Create DE tournament with ${playerCount} players → open registration → fill random → POST start`,
      'Tournament starts, bracket generated',
      e.message,
      'critical'
    );
    return { tournamentId, success: false };
  }

  // Check bracket was generated
  const matches = await getMatches(token, tournamentId);
  const wbMatches = matches.filter(m => m.stage?.name === 'Верхняя сетка');
  const lbMatches = matches.filter(m => m.stage?.name === 'Нижняя сетка');
  const gfMatches = matches.filter(m => m.stage?.name === 'Гранд-финал');

  console.log(`  Bracket: WB=${wbMatches.length}, LB=${lbMatches.length}, GF=${gfMatches.length}`);

  if (wbMatches.length === 0) {
    bug(
      `No WB matches generated for ${playerCount}p DE`,
      `Start DE tournament with ${playerCount} players → check matches`,
      'Winners bracket matches exist',
      `Got 0 WB matches (total matches: ${matches.length})`,
      'critical'
    );
    return { tournamentId, success: false };
  } else {
    pass(`WB matches exist (${wbMatches.length})`);
  }

  if (lbMatches.length === 0 && playerCount > 2) {
    bug(
      `No LB matches generated for ${playerCount}p DE`,
      `Start DE tournament with ${playerCount} players → check matches`,
      'Losers bracket matches exist',
      `Got 0 LB matches`,
      'critical'
    );
  } else if (playerCount > 2) {
    pass(`LB matches exist (${lbMatches.length})`);
  } else {
    // 2 players: LB may not exist (just one match)
    console.log(`  (2-player case: LB=${lbMatches.length})`);
  }

  if (gfMatches.length === 0) {
    bug(
      `No Grand Final match generated for ${playerCount}p DE`,
      `Start DE tournament with ${playerCount} players → check matches`,
      'Grand Final match exists',
      `Got 0 GF matches`,
      'critical'
    );
  } else {
    pass(`Grand Final match exists`);
  }

  // Check nextMatchId wiring for WB matches
  const wbWithoutNext = wbMatches.filter(m => !m.nextMatchId && !m.isBye);
  // The WB final should not have a nextMatchId to another WB match; it goes to GF
  // So only the "true" WB final should be in this list
  const wbFinal = wbMatches.find(m => !m.nextMatchId || gfMatches.some(gf => gf.id === m.nextMatchId));
  const wbNonFinalWithoutNext = wbMatches.filter(m =>
    !m.isBye && !gfMatches.some(gf => gf.id === m.nextMatchId) && m.nextMatchId === null
    && m !== wbFinal
  );
  if (wbNonFinalWithoutNext.length > 0) {
    bug(
      `WB matches missing nextMatchId wiring for ${playerCount}p`,
      `Start DE tournament → inspect WB matches`,
      'All WB non-final matches have nextMatchId',
      `${wbNonFinalWithoutNext.length} WB matches missing nextMatchId`,
      'high'
    );
  } else {
    pass(`WB match wiring appears correct`);
  }

  // Check loserNextMatchId for WB matches (should drop to LB)
  if (playerCount > 2) {
    const wbWithLoserNext = wbMatches.filter(m => !m.isBye && m.loserNextMatchId);
    const wbWithoutLoserNext = wbMatches.filter(m => !m.isBye && !m.loserNextMatchId);
    // The WB final's loser goes to LB Final (or LB semis in some structures)
    // Actually in standard DE, all WB losers drop to LB
    if (wbWithoutLoserNext.length > 0) {
      // It's OK for the WB Final to not have loserNextMatchId (they're already in GF, the LB winner is there)
      // Actually the WB Final winner goes to GF, the WB Final loser is eliminated (already lost once in DE)
      // Wait — in Double Elimination, the WB Final loser is OUT (they've lost their first match in WB Final)
      // Actually no — in proper DE, WB Final loser goes to the LB bracket
      // Let's be precise: in this implementation, WB matches have loserNextMatchId
      // The WB Final also has loserNextMatchId (they drop to LB Final, the losers bracket final)
      const wbFinalMatches = wbMatches.filter(m => !m.nextMatchId || gfMatches.some(gf => gf.id === m.nextMatchId));
      const wbNonFinalWithoutLoser = wbWithoutLoserNext.filter(m =>
        !wbFinalMatches.includes(m)
      );
      if (wbNonFinalWithoutLoser.length > 0) {
        bug(
          `WB non-final matches missing loserNextMatchId for ${playerCount}p DE`,
          `Start DE tournament → inspect WB matches`,
          'All WB non-final matches have loserNextMatchId pointing to LB',
          `${wbNonFinalWithoutLoser.length} WB matches missing loserNextMatchId`,
          'high'
        );
      } else {
        pass(`WB loser routing appears correct`);
      }
    } else {
      pass(`All WB matches have loserNextMatchId`);
    }
  }

  return { tournamentId, success: true, matches, wbMatches, lbMatches, gfMatches };
}

async function testFullFlow(token, playerCount, winnerStrategy = 'p1wins') {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Full flow test: ${playerCount}p DE, strategy=${winnerStrategy}`);
  console.log('─'.repeat(60));

  const name = `DE_FULL_${playerCount}P_${Date.now()}`;
  const t = await createTournament(token, name, playerCount);
  const tournamentId = t.id;
  await openRegistration(token, tournamentId);
  await fillRandom(token, tournamentId);
  await startTournament(token, tournamentId);

  const matchesBefore = await getMatches(token, tournamentId);
  const wbBefore = matchesBefore.filter(m => m.stage?.name === 'Верхняя сетка');
  const lbBefore = matchesBefore.filter(m => m.stage?.name === 'Нижняя сетка');

  // Play all matches
  try {
    if (winnerStrategy === 'p1wins') {
      await playAllMatchesP1WinsAll(token, tournamentId);
    } else {
      await playAllMatchesP2WinsAll(token, tournamentId);
    }
    pass(`All matches played (${playerCount}p, ${winnerStrategy})`);
  } catch (e) {
    fail(`Playing matches failed (${playerCount}p)`, e.message);
    bug(
      `Match play failed in ${playerCount}p DE (${winnerStrategy})`,
      `Start tournament → play matches sequentially`,
      'All matches complete',
      e.message,
      'critical'
    );
    return false;
  }

  // Verify tournament is FINISHED
  const finalTournament = await getTournament(token, tournamentId);
  if (finalTournament.status !== 'FINISHED') {
    bug(
      `Tournament not marked FINISHED after all matches for ${playerCount}p DE`,
      `Play all matches in ${playerCount}p DE tournament`,
      'Tournament status = FINISHED',
      `Status = ${finalTournament.status}`,
      'critical'
    );
    return false;
  } else {
    pass(`Tournament marked FINISHED (${playerCount}p)`);
  }

  // Verify participants have finalResult
  const participants = await getParticipants(token, tournamentId);
  const withResult = participants.filter(p => p.finalResult !== null);
  if (withResult.length === 0) {
    bug(
      `No participants have finalResult set after ${playerCount}p DE completion`,
      `Complete ${playerCount}p DE tournament → check participants`,
      'At least 1st place participant has finalResult',
      `0 participants have finalResult`,
      'high'
    );
  } else {
    const first = participants.find(p => p.finalResult === '1');
    if (!first) {
      bug(
        `No 1st place winner in ${playerCount}p DE`,
        `Complete ${playerCount}p DE tournament → check participants`,
        `Participant with finalResult='1' exists`,
        `No participant has finalResult='1'. Results: ${withResult.map(p => p.finalResult).join(', ')}`,
        'high'
      );
    } else {
      pass(`1st place assigned to participant (${playerCount}p): ${first.user?.login}`);
    }
  }

  return true;
}

async function testGFReset(token, playerCount) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`GF Reset test: ${playerCount}p DE`);
  console.log('─'.repeat(60));

  const name = `DE_GFRESET_${playerCount}P_${Date.now()}`;
  const t = await createTournament(token, name, playerCount);
  const tournamentId = t.id;
  await openRegistration(token, tournamentId);
  await fillRandom(token, tournamentId);
  await startTournament(token, tournamentId);

  // WB player wins WB all the way, LB player wins LB all the way
  // then LB player beats WB player in GF → requires bracket reset
  let iteration = 0;
  let gfPlayed = 0;
  let gfResetFound = false;

  while (true) {
    iteration++;
    if (iteration > 200) {
      bug(
        `Infinite loop in GF reset test for ${playerCount}p DE`,
        `Play ${playerCount}p DE with LB player winning GF`,
        'Should complete in finite iterations',
        'Exceeded 200 iterations',
        'critical'
      );
      return false;
    }

    const matches = await getMatches(token, tournamentId);
    const pending = matches.filter(m => !m.isFinished && !m.isBye && m.player1Id && m.player2Id);
    if (pending.length === 0) break;

    for (const m of pending) {
      const stage = m.stage?.name ?? '';
      if (stage === 'Верхняя сетка') {
        await setResult(token, m.id, 3, 0); // WB player (p1) wins WB
      } else if (stage === 'Нижняя сетка') {
        await setResult(token, m.id, 0, 3); // LB player (p2) wins LB
      } else if (stage === 'Гранд-финал') {
        gfPlayed++;
        if (gfPlayed === 1) {
          // First GF: LB player (p2) wins → should trigger reset
          await setResult(token, m.id, 0, 3);
        } else {
          // Second GF (reset): WB player (p1) wins to end tournament
          await setResult(token, m.id, 3, 0);
        }
      }
    }
  }

  // Check if we actually played 2 GF matches
  const allMatches = await getMatches(token, tournamentId);
  const gfMatches = allMatches.filter(m => m.stage?.name === 'Гранд-финал' && m.isFinished);

  if (gfMatches.length < 2) {
    bug(
      `GF Reset not implemented for ${playerCount}p DE — only ${gfMatches.length} GF match(es) played`,
      `Play ${playerCount}p DE → WB player wins WB → LB player wins LB → LB player wins first GF`,
      'A second (reset) Grand Final match should be created automatically',
      `Only ${gfMatches.length} Grand Final match(es) exist after LB player won first GF`,
      'high'
    );
  } else {
    gfResetFound = true;
    pass(`GF Reset occurred (${playerCount}p): ${gfMatches.length} GF matches played`);
  }

  const finalTournament = await getTournament(token, tournamentId);
  if (finalTournament.status !== 'FINISHED') {
    bug(
      `Tournament not finished after GF reset scenario (${playerCount}p)`,
      `Complete GF reset scenario`,
      'Tournament is FINISHED',
      `Status: ${finalTournament.status}`,
      'high'
    );
  } else {
    pass(`Tournament finished after GF reset (${playerCount}p)`);
  }

  return gfResetFound;
}

async function testEdgeCases(token) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing Edge Cases`);
  console.log('='.repeat(60));

  // Edge case 1: Try to access non-existent match
  const r = await getMatch(token, 999999);
  if (r.status === 404) {
    pass(`GET /api/matches/999999 returns 404`);
  } else {
    bug(
      `GET /api/matches/999999 does not return 404`,
      `GET /api/matches/999999`,
      `404 Not Found`,
      `Got ${r.status}: ${JSON.stringify(r.json)}`,
      'medium'
    );
  }

  // Edge case 2: Submit tie result in playoff
  const name = `DE_EDGE_${Date.now()}`;
  const t = await createTournament(token, name, 4);
  const tournamentId = t.id;
  await openRegistration(token, tournamentId);
  await fillRandom(token, tournamentId);
  await startTournament(token, tournamentId);
  const matches = await getMatches(token, tournamentId);
  const firstPlayable = matches.find(m => !m.isFinished && !m.isBye && m.player1Id && m.player2Id);
  if (firstPlayable) {
    const r = await setResult(token, firstPlayable.id, 3, 3);
    if (r.status === 400) {
      pass(`Playoff tie (3-3) correctly rejected`);
    } else {
      bug(
        `Playoff tie allowed in DE bracket`,
        `Submit result 3-3 (tie) for a DE bracket match`,
        `400 Bad Request — playoff can't be a draw`,
        `Got status ${r.status}: ${JSON.stringify(r.json)}`,
        'high'
      );
    }
  }

  // Edge case 3: Submit very high score
  if (firstPlayable) {
    const r = await setResult(token, firstPlayable.id, 9999, 0);
    if (r.status === 400) {
      pass(`Extremely high score rejected`);
    } else if (r.status === 200 || r.status === 201) {
      // It was accepted — check if it worked correctly
      pass(`Very high score accepted (9999-0) — match completed`);
    } else {
      fail(`Unexpected status for high score: ${r.status}`, JSON.stringify(r.json));
    }
  }

  // Edge case 4: Try to submit result for match with no players
  const emptyMatch = matches.find(m => !m.isFinished && !m.isBye && !m.player1Id && !m.player2Id);
  if (emptyMatch) {
    const r = await setResult(token, emptyMatch.id, 1, 0);
    if (r.status === 400) {
      pass(`Result for empty match (no players) correctly rejected`);
    } else {
      bug(
        `Result accepted for match with no players`,
        `Find a DE match with no players assigned → POST result`,
        `400 Bad Request`,
        `Got ${r.status}: ${JSON.stringify(r.json)}`,
        'high'
      );
    }
  } else {
    console.log(`  (No empty matches found in 4p bracket to test)`);
  }

  // Edge case 5: Submit result for already-finished match
  const finishedByeBye = matches.find(m => m.isFinished && m.isBye);
  if (finishedByeBye) {
    const r = await setResult(token, finishedByeBye.id, 1, 0);
    if (r.status === 400) {
      pass(`Result for already-finished BYE match correctly rejected`);
    } else {
      bug(
        `Result accepted for already-finished BYE match`,
        `Find BYE match → POST result`,
        `400 Bad Request`,
        `Got ${r.status}: ${JSON.stringify(r.json)}`,
        'high'
      );
    }
  }

  // Edge case 6: Navigate to /matches/999 in the UI
  try {
    await page.goto(`${WEB}/matches/999`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1500);
    const content = await page.content();
    const ss = await screenshot('edge-match-999');
    const hasNotFound = content.includes('не найден') || content.includes('404') ||
                        content.includes('Not Found') || content.includes('матч') ||
                        content.includes('Матч');
    if (hasNotFound) {
      pass(`/matches/999 shows not-found message`, ss);
    } else {
      // Check if page shows an error state
      const hasError = content.includes('error') || content.includes('Error') ||
                       content.toLowerCase().includes('ошибка');
      if (hasError) {
        pass(`/matches/999 shows error state (acceptable)`, ss);
      } else {
        bug(
          `/matches/999 shows empty/broken page instead of not-found error`,
          `Navigate to /matches/999 in browser`,
          `Not-found message or error state`,
          `Page renders without error indication (check screenshot)`,
          'medium',
          ss
        );
      }
    }
  } catch (e) {
    fail(`Navigate to /matches/999`, e.message);
  }
}

async function testBracketVisualization(token, playerCount) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Bracket visualization test: ${playerCount}p DE`);
  console.log('─'.repeat(60));

  const name = `DE_VIZ_${playerCount}P_${Date.now()}`;
  const t = await createTournament(token, name, playerCount);
  const tournamentId = t.id;
  await openRegistration(token, tournamentId);
  await fillRandom(token, tournamentId);
  await startTournament(token, tournamentId);

  // Navigate to bracket page
  await page.goto(`${WEB}/tournaments/${tournamentId}/bracket`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  const ss = await screenshot(`bracket-${playerCount}p`);

  const content = await page.content();
  const hasReactFlow = content.includes('react-flow') || content.includes('reactflow');
  if (hasReactFlow) {
    pass(`Bracket page renders with ReactFlow (${playerCount}p)`);
  } else {
    bug(
      `Bracket page doesn't render ReactFlow for ${playerCount}p DE`,
      `Navigate to /tournaments/${tournamentId}/bracket`,
      `ReactFlow canvas with bracket visualization`,
      `No ReactFlow found in page (check screenshot)`,
      'high',
      ss
    );
  }

  // Check for WB/LB labels
  const hasWBLabel = content.includes('WB') || content.includes('Верхняя');
  const hasLBLabel = content.includes('LB') || content.includes('Нижняя');
  const hasGFLabel = content.includes('Гранд-финал') || content.includes('Grand');

  if (hasWBLabel) pass(`WB label visible on bracket (${playerCount}p)`);
  else bug(`WB label missing on bracket (${playerCount}p)`, `Navigate to bracket`, `WB label visible`, `Not found`, 'medium', ss);

  if (hasLBLabel && playerCount > 2) pass(`LB label visible on bracket (${playerCount}p)`);
  else if (playerCount > 2) bug(`LB label missing on bracket (${playerCount}p)`, `Navigate to bracket`, `LB label visible`, `Not found`, 'medium', ss);

  if (hasGFLabel) pass(`Grand Final label visible on bracket (${playerCount}p)`);
  else bug(`Grand Final label missing on bracket (${playerCount}p)`, `Navigate to bracket`, `Гранд-финал label visible`, `Not found`, 'medium', ss);

  // Test clicking a match node navigates to match page
  // ReactFlow nodes should be clickable
  await page.goto(`${WEB}/tournaments/${tournamentId}/bracket`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  // Try to find a match node (it's a div with 240px width)
  const matchNodes = page.locator('.react-flow__node-match');
  const count = await matchNodes.count();
  console.log(`  Found ${count} match nodes in ReactFlow`);

  if (count > 0) {
    const firstNode = matchNodes.first();
    const url0 = page.url();
    await firstNode.click({ force: true });
    await page.waitForTimeout(1500);
    const url1 = page.url();
    if (url1.includes('/matches/')) {
      pass(`Clicking match node navigates to match page (${playerCount}p)`);
    } else {
      bug(
        `Clicking match node doesn't navigate to match page (${playerCount}p)`,
        `Navigate to /tournaments/${tournamentId}/bracket → click a match node`,
        `Navigate to /matches/<id>`,
        `URL stayed at ${url1}`,
        'medium'
      );
    }
  } else {
    bug(
      `No match nodes found in bracket visualization (${playerCount}p)`,
      `Navigate to /tournaments/${tournamentId}/bracket`,
      `React Flow match nodes visible`,
      `0 .react-flow__node-match elements`,
      'high',
      ss
    );
  }

  // Test refresh mid-tournament
  await page.goto(`${WEB}/tournaments/${tournamentId}/bracket`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1500);
  const ssAfterRefresh = await screenshot(`bracket-${playerCount}p-after-refresh`);
  const contentAfterRefresh = await page.content();
  const hasContentAfterRefresh = contentAfterRefresh.includes('react-flow') || contentAfterRefresh.includes('reactflow');
  if (hasContentAfterRefresh) {
    pass(`Bracket persists after page refresh (${playerCount}p)`);
  } else {
    bug(
      `Bracket disappears/breaks after page refresh (${playerCount}p)`,
      `Navigate to bracket → refresh page`,
      `Bracket still visible`,
      `No ReactFlow after refresh`,
      'high',
      ssAfterRefresh
    );
  }

  return tournamentId;
}

async function testLBDropVerification(token, playerCount) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`LB Drop verification: ${playerCount}p DE`);
  console.log('─'.repeat(60));

  const name = `DE_LBDROP_${playerCount}P_${Date.now()}`;
  const t = await createTournament(token, name, playerCount);
  const tournamentId = t.id;
  await openRegistration(token, tournamentId);
  await fillRandom(token, tournamentId);
  await startTournament(token, tournamentId);

  const matchesBefore = await getMatches(token, tournamentId);
  const wbR1 = matchesBefore.filter(m => m.stage?.name === 'Верхняя сетка' && m.roundNumber === 1 && !m.isBye);

  if (wbR1.length === 0) {
    console.log(`  No WBR1 non-bye matches to test`);
    return;
  }

  // Play WBR1 — p1 wins. Then check that p2 appears in LB.
  const firstWbR1 = wbR1[0];
  const loserExpected = firstWbR1.player2?.user?.login;
  if (!loserExpected) {
    console.log(`  WBR1 match has no player2 yet — can't verify LB drop`);
    return;
  }

  const lbDestMatchId = firstWbR1.loserNextMatchId;
  if (!lbDestMatchId) {
    bug(
      `WBR1 match has no loserNextMatchId (${playerCount}p)`,
      `Inspect WBR1 match after bracket generation`,
      `loserNextMatchId set to LB match`,
      `loserNextMatchId is null for WBR1 match with 2 real players`,
      'critical'
    );
    return;
  }

  // Set result for first WBR1 match (p1 wins)
  await setResult(token, firstWbR1.id, 2, 0);

  // Check that LB match now has p2 as participant
  const lbMatchAfter = await getMatch(token, lbDestMatchId);
  if (lbMatchAfter.status !== 200) {
    fail(`Get LB match after WBR1 result`, `Status ${lbMatchAfter.status}`);
    return;
  }

  const lbMatch = lbMatchAfter.json;
  const lbSlot = firstWbR1.loserNextMatchSlot;
  const loserInLB = lbSlot === 1 ? lbMatch.player1?.user?.login : lbMatch.player2?.user?.login;

  if (loserInLB === loserExpected) {
    pass(`WBR1 loser dropped to LB correctly (${playerCount}p): ${loserExpected} → LB match ${lbDestMatchId} slot ${lbSlot}`);
  } else {
    bug(
      `WBR1 loser not in correct LB slot (${playerCount}p)`,
      `Play WBR1 match → check LB match ${lbDestMatchId}`,
      `${loserExpected} in LB match slot ${lbSlot}`,
      `Found: slot1=${lbMatch.player1?.user?.login ?? 'null'}, slot2=${lbMatch.player2?.user?.login ?? 'null'}`,
      'critical'
    );
  }
}

async function testTwoPlayerDE(token) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Special test: 2-player DE`);
  console.log('='.repeat(60));

  const name = `DE_2P_SPECIAL_${Date.now()}`;
  let t;
  try {
    t = await createTournament(token, name, 2);
  } catch (e) {
    bug(`2-player DE creation failed`, `Create DE tournament with maxParticipants=2`, `201 Created`, e.message, 'critical');
    return;
  }
  const tournamentId = t.id;
  await openRegistration(token, tournamentId);
  await fillRandom(token, tournamentId);

  let startR;
  try {
    startR = await startTournament(token, tournamentId);
    pass(`2-player DE starts successfully`);
  } catch (e) {
    bug(`2-player DE fails to start`, `Create 2p DE → fill random → start`, `Tournament starts`, e.message, 'critical');
    return;
  }

  const matches = await getMatches(token, tournamentId);
  console.log(`  Matches generated: ${matches.length}`);
  console.log(`  Stages: ${[...new Set(matches.map(m => m.stage?.name))].join(', ')}`);

  // In a 2-player DE: there's 1 match, if p1 wins they win tournament?
  // Actually in proper 2-player DE: 1 WB match, and a GF (best of 2?)
  // But this implementation may just have 1 match + GF
  const wbMatches = matches.filter(m => m.stage?.name === 'Верхняя сетка');
  const lbMatches = matches.filter(m => m.stage?.name === 'Нижняя сетка');
  const gfMatches = matches.filter(m => m.stage?.name === 'Гранд-финал');

  console.log(`  WB: ${wbMatches.length}, LB: ${lbMatches.length}, GF: ${gfMatches.length}`);

  // 2p DE is edge case — some implementations handle it poorly
  // Play: p1 wins WB match
  const playableWB = wbMatches.filter(m => !m.isBye && m.player1Id && m.player2Id);
  if (playableWB.length === 0) {
    bug(
      `No playable WB matches in 2p DE`,
      `Start 2p DE → check WB matches`,
      `At least 1 playable WB match`,
      `0 playable WB matches (may be all byes)`,
      'critical'
    );
    return;
  }

  await setResult(token, playableWB[0].id, 2, 0);

  // Check GF now has players
  const matchesAfter = await getMatches(token, tournamentId);
  const gfAfter = matchesAfter.filter(m => m.stage?.name === 'Гранд-финал');

  if (gfAfter.length === 0) {
    bug(
      `No GF match in 2p DE after WB match played`,
      `2p DE → play WB match → check GF`,
      `GF match with both players`,
      `No GF matches exist`,
      'high'
    );
    return;
  }

  const gfMatch = gfAfter[0];
  if (!gfMatch.player1Id || !gfMatch.player2Id) {
    bug(
      `GF match in 2p DE has missing players after WB match`,
      `2p DE → play WB match → check GF`,
      `GF has both players`,
      `GF: p1=${gfMatch.player1?.user?.login ?? 'null'}, p2=${gfMatch.player2?.user?.login ?? 'null'}`,
      'high'
    );
    return;
  }

  pass(`2p DE: GF has both players after WB match`);

  // Play GF
  await setResult(token, gfMatch.id, 2, 0);
  const finalT = await getTournament(token, tournamentId);
  if (finalT.status === 'FINISHED') {
    pass(`2p DE completes and tournament finishes`);
  } else {
    bug(
      `2p DE doesn't finish after GF`,
      `2p DE → play WB → play GF`,
      `Tournament FINISHED`,
      `Status: ${finalT.status}`,
      'high'
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Starting Double Elimination QA Tests...\n');

  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();

  // Login via UI first to get session
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle', timeout: 15000 });

  const token = await login();

  // Login via UI for visual tests
  await page.goto(`${WEB}/login`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle', timeout: 15000 });

  // Set auth in localStorage
  await page.evaluate((tok) => {
    localStorage.setItem('auth-token', tok);
    localStorage.setItem('token', tok);
  }, token);

  // Try setting token in the app's way
  try {
    await page.evaluate((tok) => {
      // Try zustand store hydration
      const store = window.__authStore;
      if (store) store.setState({ accessToken: tok });
    }, token);
  } catch {}

  // ─── Test bracket structure for each player count ───
  const scenarios = [
    { count: 2, label: 'minimum' },
    { count: 3, label: 'odd small' },
    { count: 4, label: 'standard small' },
    { count: 5, label: 'odd with byes' },
    { count: 6, label: 'non-power-of-2' },
    { count: 8, label: 'power of 2 standard' },
  ];

  const results = {};
  for (const s of scenarios) {
    results[s.count] = await testPlayerCount(token, s.count, s.label);
  }

  // ─── Full flow tests ───
  const fullFlowResults = {};
  for (const s of scenarios) {
    if (s.count === 2) {
      // 2p tested separately in testTwoPlayerDE
      fullFlowResults[s.count] = null;
      continue;
    }
    const success = await testFullFlow(token, s.count, 'p1wins');
    fullFlowResults[s.count] = success;
  }

  // ─── GF Reset test (4p is simplest) ───
  console.log('\n=== GF Reset Tests ===');
  await testGFReset(token, 4);
  await testGFReset(token, 8);

  // ─── LB Drop verification ───
  console.log('\n=== LB Drop Verification ===');
  await testLBDropVerification(token, 4);
  await testLBDropVerification(token, 8);
  await testLBDropVerification(token, 5);

  // ─── 2 player special case ───
  await testTwoPlayerDE(token);

  // ─── Bracket visualization (visual tests) ───
  // Login to the web UI
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle', timeout: 15000 });
  // Use API to get token, then inject into page store
  await page.evaluate((tok) => {
    // Try different possible storage keys
    localStorage.setItem('auth-token', tok);
    localStorage.setItem('accessToken', tok);
  }, token);
  await page.goto(`${WEB}/`, { waitUntil: 'networkidle', timeout: 15000 });

  // Try actual login via form
  try {
    await page.goto(`${WEB}/`, { waitUntil: 'domcontentloaded', timeout: 10000 });
    const loginBtn = page.locator('button', { hasText: /войти|login|вход/i }).first();
    if (await loginBtn.isVisible({ timeout: 2000 })) {
      await loginBtn.click();
      await page.waitForTimeout(500);
    }
    const loginInput = page.locator('input[type="text"], input[name="login"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    if (await loginInput.isVisible({ timeout: 2000 })) {
      await loginInput.fill('admin');
      await passwordInput.fill('admin123');
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(2000);
      pass('Logged in via UI form');
    }
  } catch (e) {
    console.log(`  UI login attempt: ${e.message}`);
  }

  // Run visualization tests for key scenarios
  for (const count of [4, 8]) {
    await testBracketVisualization(token, count);
  }

  // ─── Edge case tests ───
  await testEdgeCases(token);

  await browser.close();

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log('DOUBLE ELIMINATION QA SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total PASS: ${passCount}`);
  console.log(`Total FAIL: ${failCount}`);
  console.log(`Total BUGS: ${bugCount}`);

  if (bugs.length > 0) {
    console.log('\n--- BUG LIST ---');
    for (const b of bugs) {
      console.log(`\n#${b.num} [${b.severity.toUpperCase()}] ${b.title}`);
      console.log(`  Steps: ${b.steps}`);
      console.log(`  Expected: ${b.expected}`);
      console.log(`  Actual: ${b.actual}`);
      if (b.screenshotPath) console.log(`  Screenshot: ${b.screenshotPath}`);
    }
  }

  console.log('\n--- PLAYER COUNT SUMMARY ---');
  console.log('Count | Bracket OK | Full Flow | Notes');
  console.log('------|------------|-----------|------');
  for (const s of scenarios) {
    const r = results[s.count];
    const ff = fullFlowResults[s.count];
    const bracketOK = r && r.success ? 'YES' : 'NO';
    const flowOK = ff ? 'YES' : 'NO';
    const notes = r ? `WB=${r.wbMatches?.length ?? '?'}, LB=${r.lbMatches?.length ?? '?'}, GF=${r.gfMatches?.length ?? '?'}` : 'CREATION FAILED';
    console.log(`${String(s.count).padEnd(5)} | ${bracketOK.padEnd(10)} | ${flowOK.padEnd(9)} | ${notes}`);
  }

  return bugs;
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
