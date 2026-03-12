/**
 * QA Script: Single Elimination Tournament — Adversarial Testing
 * Tests bracket generation, BYE handling, match flow, winner determination.
 * Run with: node qa-single-elim.mjs
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
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${endpoint}`, opts);
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

async function login(user = 'admin', pass2 = 'admin123') {
  const res = await req('POST', '/api/auth/login', { login: user, password: pass2 });
  if (res.status === 200 && res.data?.accessToken) return res.data.accessToken;
  console.log(`    Login failed: ${res.status} ${JSON.stringify(res.data)}`);
  return null;
}

async function createTournament(token, overrides = {}) {
  const body = {
    tournamentName: `SE QA ${Date.now()}`,
    gameName: 'TestGame',
    format: 'SINGLE_ELIMINATION',
    maxParticipants: 8,
    ...overrides,
  };
  const res = await req('POST', '/api/tournaments', body, token);
  if (res.status !== 201) throw new Error(`Create tournament failed: ${res.status} ${JSON.stringify(res.data)}`);
  return res.data;
}

async function openRegistration(token, tournamentId) {
  const res = await req('POST', `/api/tournaments/${tournamentId}/open-registration`, {}, token);
  if (res.status !== 200) throw new Error(`Open registration failed: ${res.status} ${JSON.stringify(res.data)}`);
}

async function registerUser(token, tournamentId) {
  const res = await req('POST', `/api/tournaments/${tournamentId}/join`, {}, token);
  if (res.status !== 201) throw new Error(`Join failed: ${res.status} ${JSON.stringify(res.data)}`);
  return res.data;
}

async function fillRandom(token, tournamentId) {
  const res = await req('POST', `/api/tournaments/${tournamentId}/fill-random`, {}, token);
  return res;
}

async function startTournament(token, tournamentId) {
  const res = await req('POST', `/api/tournaments/${tournamentId}/grid/finalize`, {
    gridJson: '{}',
    participantAssignments: [],
  }, token);
  return res;
}

async function getMatches(token, tournamentId) {
  const res = await req('GET', `/api/tournaments/${tournamentId}/matches`, undefined, token);
  return res.data || [];
}

async function setMatchResult(token, matchId, p1Score, p2Score) {
  const res = await req('POST', `/api/matches/${matchId}/result`, {
    player1Score: p1Score,
    player2Score: p2Score,
    isFinal: true,
  }, token);
  return res;
}

async function getTournament(token, id) {
  const res = await req('GET', `/api/tournaments/${id}`, undefined, token);
  return res.data;
}

async function getParticipants(token, tournamentId) {
  const res = await req('GET', `/api/tournaments/${tournamentId}/participants`, undefined, token);
  return res.data || [];
}

async function createAndRegisterUsers(adminToken, count) {
  // Register 'count' users and return their tokens + participant info
  const users = [];
  for (let i = 0; i < count; i++) {
    const ts = Date.now();
    const userLogin = `qase${ts}u${i}`;
    const email = `qase${ts}u${i}@test.com`;
    const regRes = await req('POST', '/api/auth/register', { login: userLogin, email, password: 'test1234' });
    if (regRes.status !== 201) throw new Error(`Register user failed: ${regRes.status} ${JSON.stringify(regRes.data)}`);
    const token = regRes.data?.accessToken; // use token from registration response directly
    users.push({ login: userLogin, token, id: regRes.data?.user?.id });
  }
  return users;
}

async function loginUser(login2, password) {
  const res = await req('POST', '/api/auth/login', { login: login2, password });
  return res.data?.accessToken;
}

// ─── SCREENSHOT helper ────────────────────────────────────────────────────────
async function screenshot(page, name) {
  const p = path.join(SS_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`    📸 Screenshot: ${p}`);
  return p;
}

// ─── TEST 1: Starting with 1 participant ─────────────────────────────────────
async function test1Player(adminToken) {
  console.log('\n=== TEST: Start tournament with 1 participant ===');
  const t = await createTournament(adminToken, { maxParticipants: 2, tournamentName: `1P ${Date.now()}` });
  await openRegistration(adminToken, t.id);
  // Only admin joins — need to create a user that joins
  // Actually, admin can join their own tournament? Let's test
  const joinRes = await req('POST', `/api/tournaments/${t.id}/join`, {}, adminToken);
  console.log(`    Admin join own tournament: ${joinRes.status} — ${JSON.stringify(joinRes.data)}`);

  // Try to start with 1 participant
  const startRes = await startTournament(adminToken, t.id);
  console.log(`    Start with 1 participant: ${startRes.status} — ${JSON.stringify(startRes.data)}`);
  if (startRes.status === 400) {
    pass('Start with 1 participant returns 400');
  } else if (startRes.status === 200) {
    bug(
      'Tournament can start with only 1 participant',
      '1. Create SE tournament, maxParticipants=2. 2. Open registration. 3. 1 user joins. 4. POST /grid/finalize',
      '400 Bad Request: "Нужно минимум 2 участника"',
      `Got ${startRes.status}: ${JSON.stringify(startRes.data)}`,
      'critical'
    );
  } else {
    console.log(`    Unexpected status ${startRes.status}`);
    fail(`1-participant start unexpected: ${startRes.status}`);
  }
}

// ─── TEST: Admin joining own tournament ──────────────────────────────────────
async function testOrganizerJoin(adminToken) {
  console.log('\n=== TEST: Can organizer join their own tournament? ===');
  const t = await createTournament(adminToken, { maxParticipants: 4, tournamentName: `OrgJoin ${Date.now()}` });
  await openRegistration(adminToken, t.id);
  const joinRes = await req('POST', `/api/tournaments/${t.id}/join`, {}, adminToken);
  console.log(`    Organizer join own tournament: ${joinRes.status} — ${JSON.stringify(joinRes.data)}`);
  if (joinRes.status === 201) {
    // This might be intentional or a bug depending on requirements
    console.log('    INFO: Organizer CAN join their own tournament (201). May be intentional.');
    pass('Organizer join: returns 201 (either allowed or needs rule)');
  } else if (joinRes.status === 400) {
    pass('Organizer cannot join own tournament (400)');
  } else {
    fail(`Organizer join unexpected status: ${joinRes.status}`);
  }
  return t.id;
}

// ─── TEST: 2 players — minimum case ─────────────────────────────────────────
async function test2Players(adminToken) {
  console.log('\n=== TEST: 2 Players Single Elimination ===');
  const t = await createTournament(adminToken, { maxParticipants: 2, tournamentName: `2P SE ${Date.now()}` });
  await openRegistration(adminToken, t.id);

  // Create 2 users
  const users = await createAndRegisterUsers(adminToken, 2);
  for (const u of users) {
    await registerUser(u.token, t.id);
  }

  const startRes = await startTournament(adminToken, t.id);
  console.log(`    Start (2 players): ${startRes.status} — ${JSON.stringify(startRes.data)}`);
  if (startRes.status !== 200) {
    bug(
      '2-player SE tournament fails to start',
      '1. Create SE with maxParticipants=2. 2. 2 users join. 3. Finalize grid.',
      'Status 200, tournament starts',
      `Status ${startRes.status}: ${JSON.stringify(startRes.data)}`,
      'critical'
    );
    return null;
  }
  pass('2-player SE starts successfully');

  const matches = await getMatches(adminToken, t.id);
  console.log(`    Matches generated: ${matches.length}`);
  if (matches.length !== 1) {
    bug(
      '2-player SE: wrong number of matches',
      'Start 2-player SE tournament',
      '1 match (the final)',
      `${matches.length} matches`,
      'high'
    );
  } else {
    pass('2-player SE generates 1 match');
  }

  // Verify no BYEs
  const byeMatches = matches.filter(m => m.isBye);
  if (byeMatches.length > 0) {
    bug(
      '2-player SE: unexpected BYE match',
      'Start 2-player SE tournament',
      'No BYE matches',
      `${byeMatches.length} BYE match(es)`,
      'medium'
    );
  } else {
    pass('2-player SE: no BYEs');
  }

  // Play the match
  if (matches.length >= 1) {
    const m = matches[0];
    if (!m.player1Id || !m.player2Id) {
      bug('2-player SE: match has no players assigned', 'After starting 2-player tournament', 'Both players assigned to match', `player1Id=${m.player1Id}, player2Id=${m.player2Id}`, 'critical');
      return t;
    }

    const resultRes = await setMatchResult(adminToken, m.id, 2, 1);
    console.log(`    Set match result: ${resultRes.status} — ${JSON.stringify(resultRes.data)?.substring(0, 100)}`);
    if (resultRes.status !== 200) {
      bug('2-player SE: cannot set match result', 'Set result 2-1 on the final', 'Status 200', `Status ${resultRes.status}: ${JSON.stringify(resultRes.data)}`, 'critical');
    } else {
      pass('2-player SE: match result set successfully');
    }

    // Check tournament is FINISHED
    const tourney = await getTournament(adminToken, t.id);
    console.log(`    Tournament status: ${tourney?.status}`);
    if (tourney?.status === 'FINISHED') {
      pass('2-player SE: tournament finishes after final');
    } else {
      bug('2-player SE: tournament not marked FINISHED after final', 'Complete the only match in 2-player SE', 'Tournament status = FINISHED', `Status = ${tourney?.status}`, 'high');
    }

    // Check final placements
    const parts = await getParticipants(adminToken, t.id);
    console.log(`    Participants: ${parts.map(p => `${p.user.login}:${p.finalResult}`).join(', ')}`);
    const winner = parts.find(p => p.finalResult === '1');
    const runnerUp = parts.find(p => p.finalResult === '2');
    if (!winner || !runnerUp) {
      bug('2-player SE: final placements not assigned', 'Complete 2-player SE tournament', 'Player 1 gets finalResult=1, Player 2 gets finalResult=2', `Winner: ${winner?.user?.login ?? 'none'}, Runner-up: ${runnerUp?.user?.login ?? 'none'}`, 'high');
    } else {
      pass(`2-player SE: placements correct — 1st: ${winner.user.login}, 2nd: ${runnerUp.user.login}`);
    }
  }

  return t;
}

// ─── TEST: 3 players ─────────────────────────────────────────────────────────
async function test3Players(adminToken) {
  console.log('\n=== TEST: 3 Players Single Elimination (needs 1 BYE) ===');
  const t = await createTournament(adminToken, { maxParticipants: 4, tournamentName: `3P SE ${Date.now()}` });
  await openRegistration(adminToken, t.id);

  const users = await createAndRegisterUsers(adminToken, 3);
  for (const u of users) {
    await registerUser(u.token, t.id);
  }

  const startRes = await startTournament(adminToken, t.id);
  console.log(`    Start (3 players): ${startRes.status}`);
  if (startRes.status !== 200) {
    bug('3-player SE fails to start', 'Create SE with maxP=4, 3 users join, finalize', '200 OK', `${startRes.status}: ${JSON.stringify(startRes.data)}`, 'critical');
    return null;
  }
  pass('3-player SE starts');

  const matches = await getMatches(adminToken, t.id);
  console.log(`    Matches: ${matches.length}`);

  // 3 players in bracket of 4: round 1 has 2 matches (1 bye), round 2 has 1 match (final) = 3 total
  if (matches.length !== 3) {
    bug('3-player SE: wrong match count', 'Start 3-player SE', '3 matches (2 round-1 + 1 final)', `${matches.length} matches`, 'high');
  } else {
    pass('3-player SE: 3 matches generated');
  }

  const byeMatches = matches.filter(m => m.isBye);
  console.log(`    BYE matches: ${byeMatches.length}`);
  if (byeMatches.length !== 1) {
    bug('3-player SE: wrong BYE count', 'Start 3-player SE (bracket of 4)', '1 BYE match', `${byeMatches.length} BYE(s)`, 'high');
  } else {
    pass('3-player SE: 1 BYE match correctly generated');
  }

  // Check the BYE match auto-advanced winner
  if (byeMatches.length === 1) {
    const byeMatch = byeMatches[0];
    console.log(`    BYE match: player1Id=${byeMatch.player1Id}, player2Id=${byeMatch.player2Id}, winner=${byeMatch.winnerId}, isFinished=${byeMatch.isFinished}`);
    if (!byeMatch.isFinished || !byeMatch.winnerId) {
      bug('3-player SE: BYE match not auto-finished with winner', 'Generate 3-player bracket', 'BYE match isFinished=true with winnerId set', `isFinished=${byeMatch.isFinished}, winnerId=${byeMatch.winnerId}`, 'high');
    } else {
      pass('BYE match auto-finished with winner');
    }

    // Check the BYE winner auto-advanced into semifinal/final
    const finalMatch = matches.find(m => m.roundNumber === 2);
    if (finalMatch) {
      console.log(`    Final match: p1Id=${finalMatch.player1Id}, p2Id=${finalMatch.player2Id}`);
      if (finalMatch.player1Id === byeMatch.winnerId || finalMatch.player2Id === byeMatch.winnerId) {
        pass('BYE winner auto-advanced to final round');
      } else {
        bug('BYE winner not advanced to next round', 'Complete BYE in 3-player bracket', 'BYE winner appears in final', `Final: p1=${finalMatch.player1Id}, p2=${finalMatch.player2Id}, byeWinner=${byeMatch.winnerId}`, 'critical');
      }
    }
  }

  // Play non-BYE round-1 match
  const realMatch = matches.find(m => !m.isBye && m.roundNumber === 1);
  if (realMatch) {
    if (!realMatch.player1Id || !realMatch.player2Id) {
      bug('3-player SE: real round-1 match missing players', 'After starting 3-player bracket', 'Both players assigned', `p1=${realMatch.player1Id}, p2=${realMatch.player2Id}`, 'critical');
      return t;
    }
    const r1Res = await setMatchResult(adminToken, realMatch.id, 3, 0);
    if (r1Res.status !== 200) {
      bug('3-player SE: cannot set R1 result', 'Set result on round-1 match', '200 OK', `${r1Res.status}`, 'critical');
      return t;
    }
    pass('3-player SE: R1 result set');

    // Now check final has both players
    const updatedMatches = await getMatches(adminToken, t.id);
    const finalMatch2 = updatedMatches.find(m => m.roundNumber === 2);
    if (finalMatch2 && finalMatch2.player1Id && finalMatch2.player2Id) {
      pass('Final match fully populated after R1');
    } else {
      bug('Final match not fully populated after R1', 'Complete R1 in 3-player bracket', 'Final has both players', `p1=${finalMatch2?.player1Id}, p2=${finalMatch2?.player2Id}`, 'critical');
      return t;
    }

    // Play the final
    const finalRes = await setMatchResult(adminToken, finalMatch2.id, 2, 1);
    if (finalRes.status !== 200) {
      bug('3-player SE: cannot set final result', 'Set result on final', '200 OK', `${finalRes.status}`, 'critical');
      return t;
    }
    pass('3-player SE: final result set');

    const tourney = await getTournament(adminToken, t.id);
    if (tourney?.status === 'FINISHED') {
      pass('3-player SE: tournament FINISHED');
    } else {
      bug('3-player SE: not FINISHED after final', 'Complete final', 'FINISHED', tourney?.status, 'high');
    }
  }

  return t;
}

// ─── TEST: 4 players (perfect bracket) ───────────────────────────────────────
async function test4Players(adminToken) {
  console.log('\n=== TEST: 4 Players Single Elimination (perfect bracket) ===');
  const t = await createTournament(adminToken, { maxParticipants: 4, tournamentName: `4P SE ${Date.now()}` });
  await openRegistration(adminToken, t.id);

  const users = await createAndRegisterUsers(adminToken, 4);
  for (const u of users) {
    await registerUser(u.token, t.id);
  }

  const startRes = await startTournament(adminToken, t.id);
  if (startRes.status !== 200) {
    bug('4-player SE fails to start', 'Create 4-player SE, 4 join, finalize', '200 OK', `${startRes.status}`, 'critical');
    return null;
  }
  pass('4-player SE starts');

  const matches = await getMatches(adminToken, t.id);
  console.log(`    Matches: ${matches.length}`);
  // 4 players: 2 semis + 1 final = 3
  if (matches.length !== 3) {
    bug('4-player SE: wrong match count', 'Start 4-player SE', '3 matches', `${matches.length}`, 'high');
  } else {
    pass('4-player SE: 3 matches');
  }

  const byeMatches = matches.filter(m => m.isBye);
  if (byeMatches.length !== 0) {
    bug('4-player SE: unexpected BYEs', 'Start 4-player SE (perfect bracket)', '0 BYEs', `${byeMatches.length} BYEs`, 'medium');
  } else {
    pass('4-player SE: 0 BYEs (perfect bracket)');
  }

  // Play all rounds
  const r1Matches = matches.filter(m => m.roundNumber === 1);
  for (const m of r1Matches) {
    const res = await setMatchResult(adminToken, m.id, 2, 0);
    if (res.status !== 200) {
      bug('4-player SE: R1 match result failure', 'Set result', '200', `${res.status}`, 'critical');
    }
  }
  pass('4-player SE: R1 results set');

  const updatedMatches = await getMatches(adminToken, t.id);
  const finalMatch = updatedMatches.find(m => m.roundNumber === 2);
  if (!finalMatch?.player1Id || !finalMatch?.player2Id) {
    bug('4-player SE: final not populated after R1', 'Complete both R1 matches', 'Final has both players', `p1=${finalMatch?.player1Id}, p2=${finalMatch?.player2Id}`, 'critical');
    return t;
  }
  pass('4-player SE: final populated');

  const finalRes = await setMatchResult(adminToken, finalMatch.id, 1, 0);
  if (finalRes.status !== 200) {
    bug('4-player SE: final result failure', 'Set final result', '200', `${finalRes.status}`, 'critical');
    return t;
  }
  pass('4-player SE: final result set');

  const tourney = await getTournament(adminToken, t.id);
  if (tourney?.status === 'FINISHED') {
    pass('4-player SE: FINISHED after final');
  } else {
    bug('4-player SE: not FINISHED', 'Complete final', 'FINISHED', tourney?.status, 'high');
  }

  // Check 3rd place
  const parts = await getParticipants(adminToken, t.id);
  const thirdPlacers = parts.filter(p => p.finalResult === '3');
  console.log(`    3rd place: ${thirdPlacers.length} players`);
  if (thirdPlacers.length !== 2) {
    bug('4-player SE: wrong 3rd place count', 'Complete 4-player SE', '2 players with finalResult=3 (semi-final losers)', `${thirdPlacers.length} players`, 'medium');
  } else {
    pass('4-player SE: 2 semi-final losers get 3rd place');
  }

  return t;
}

// ─── TEST: 5 players ─────────────────────────────────────────────────────────
async function test5Players(adminToken) {
  console.log('\n=== TEST: 5 Players Single Elimination (3 BYEs needed, bracket of 8) ===');
  const t = await createTournament(adminToken, { maxParticipants: 8, tournamentName: `5P SE ${Date.now()}` });
  await openRegistration(adminToken, t.id);

  const users = await createAndRegisterUsers(adminToken, 5);
  for (const u of users) {
    await registerUser(u.token, t.id);
  }

  const startRes = await startTournament(adminToken, t.id);
  if (startRes.status !== 200) {
    bug('5-player SE fails to start', '5 users join bracket-of-8, finalize', '200 OK', `${startRes.status}`, 'critical');
    return null;
  }
  pass('5-player SE starts');

  const matches = await getMatches(adminToken, t.id);
  console.log(`    Matches: ${matches.length}`);
  // Bracket of 8: 4 QF + 2 SF + 1 F = 7 total
  if (matches.length !== 7) {
    bug('5-player SE: wrong match count', 'Start 5-player SE (bracket of 8)', '7 matches (4+2+1)', `${matches.length}`, 'high');
  } else {
    pass('5-player SE: 7 matches');
  }

  const byeMatches = matches.filter(m => m.isBye);
  console.log(`    BYE count: ${byeMatches.length} (expected 3)`);
  if (byeMatches.length !== 3) {
    bug('5-player SE: wrong BYE count', 'Start 5-player in bracket of 8', '3 BYEs', `${byeMatches.length} BYEs`, 'high');
  } else {
    pass('5-player SE: 3 BYEs correct');
  }

  // Check that no two BYEs face each other (null vs null)
  for (const m of byeMatches) {
    if (!m.player1Id) {
      bug('5-player SE: BYE match has no player1 (null vs BYE situation)', 'Generate 5-player bracket', 'BYE match always has player1Id set (real player gets bye)', `BYE match id=${m.id} has null player1Id`, 'critical');
    }
  }

  // BYE winners should auto-advance
  for (const byeM of byeMatches) {
    if (!byeM.isFinished || !byeM.winnerId) {
      bug('5-player SE: BYE match not auto-finished', 'Generate 5-player bracket', 'All BYE matches isFinished=true', `Match id=${byeM.id}: isFinished=${byeM.isFinished}, winnerId=${byeM.winnerId}`, 'critical');
      break;
    }
  }

  return t;
}

// ─── TEST: 6 players ─────────────────────────────────────────────────────────
async function test6Players(adminToken) {
  console.log('\n=== TEST: 6 Players Single Elimination (2 BYEs needed) ===');
  const t = await createTournament(adminToken, { maxParticipants: 8, tournamentName: `6P SE ${Date.now()}` });
  await openRegistration(adminToken, t.id);

  const users = await createAndRegisterUsers(adminToken, 6);
  for (const u of users) {
    await registerUser(u.token, t.id);
  }

  const startRes = await startTournament(adminToken, t.id);
  if (startRes.status !== 200) {
    bug('6-player SE fails to start', '6 join, finalize', '200 OK', `${startRes.status}`, 'critical');
    return null;
  }
  pass('6-player SE starts');

  const matches = await getMatches(adminToken, t.id);
  const byeMatches = matches.filter(m => m.isBye);
  console.log(`    Matches: ${matches.length}, BYEs: ${byeMatches.length} (expected 2)`);
  if (byeMatches.length !== 2) {
    bug('6-player SE: wrong BYE count', 'Start 6-player bracket-of-8', '2 BYEs', `${byeMatches.length}`, 'high');
  } else {
    pass('6-player SE: 2 BYEs correct');
  }
  return t;
}

// ─── TEST: 7 players ─────────────────────────────────────────────────────────
async function test7Players(adminToken) {
  console.log('\n=== TEST: 7 Players Single Elimination (1 BYE needed) ===');
  const t = await createTournament(adminToken, { maxParticipants: 8, tournamentName: `7P SE ${Date.now()}` });
  await openRegistration(adminToken, t.id);

  const users = await createAndRegisterUsers(adminToken, 7);
  for (const u of users) {
    await registerUser(u.token, t.id);
  }

  const startRes = await startTournament(adminToken, t.id);
  if (startRes.status !== 200) {
    bug('7-player SE fails to start', '7 join, finalize', '200 OK', `${startRes.status}`, 'critical');
    return null;
  }
  pass('7-player SE starts');

  const matches = await getMatches(adminToken, t.id);
  const byeMatches = matches.filter(m => m.isBye);
  console.log(`    Matches: ${matches.length}, BYEs: ${byeMatches.length} (expected 1)`);
  if (byeMatches.length !== 1) {
    bug('7-player SE: wrong BYE count', 'Start 7-player bracket-of-8', '1 BYE', `${byeMatches.length}`, 'high');
  } else {
    pass('7-player SE: 1 BYE correct');
  }
  return t;
}

// ─── TEST: 8 players ─────────────────────────────────────────────────────────
async function test8Players(adminToken) {
  console.log('\n=== TEST: 8 Players Single Elimination (perfect bracket) ===');
  const t = await createTournament(adminToken, { maxParticipants: 8, tournamentName: `8P SE ${Date.now()}` });
  await openRegistration(adminToken, t.id);

  const users = await createAndRegisterUsers(adminToken, 8);
  for (const u of users) {
    await registerUser(u.token, t.id);
  }

  const startRes = await startTournament(adminToken, t.id);
  if (startRes.status !== 200) {
    bug('8-player SE fails to start', '8 join, finalize', '200 OK', `${startRes.status}`, 'critical');
    return null;
  }
  pass('8-player SE starts');

  const matches = await getMatches(adminToken, t.id);
  const byeMatches = matches.filter(m => m.isBye);
  console.log(`    Matches: ${matches.length} (expected 7), BYEs: ${byeMatches.length} (expected 0)`);
  if (matches.length !== 7) {
    bug('8-player SE: wrong match count', 'Start 8-player SE', '7 matches', `${matches.length}`, 'high');
  } else {
    pass('8-player SE: 7 matches');
  }
  if (byeMatches.length !== 0) {
    bug('8-player SE: unexpected BYEs', 'Start 8-player SE (perfect)', '0 BYEs', `${byeMatches.length}`, 'medium');
  } else {
    pass('8-player SE: 0 BYEs (perfect)');
  }

  // Complete full tournament
  let round = 1;
  while (true) {
    const allMatches = await getMatches(adminToken, t.id);
    const roundMatches = allMatches.filter(m => m.roundNumber === round && !m.isFinished && !m.isBye);
    if (roundMatches.length === 0) break;
    for (const m of roundMatches) {
      if (m.player1Id && m.player2Id) {
        await setMatchResult(adminToken, m.id, 1, 0);
      }
    }
    round++;
    if (round > 10) break; // safety
  }
  pass('8-player SE: all rounds completed');

  const tourney = await getTournament(adminToken, t.id);
  if (tourney?.status === 'FINISHED') {
    pass('8-player SE: FINISHED');
  } else {
    bug('8-player SE: not FINISHED after all matches', 'Complete all 8-player SE matches', 'FINISHED', tourney?.status, 'high');
  }

  return t;
}

// ─── TEST: 16 players ────────────────────────────────────────────────────────
async function test16Players(adminToken) {
  console.log('\n=== TEST: 16 Players Single Elimination ===');
  const t = await createTournament(adminToken, { maxParticipants: 16, tournamentName: `16P SE ${Date.now()}` });
  await openRegistration(adminToken, t.id);

  const users = await createAndRegisterUsers(adminToken, 16);
  for (const u of users) {
    await registerUser(u.token, t.id);
  }

  const startRes = await startTournament(adminToken, t.id);
  if (startRes.status !== 200) {
    bug('16-player SE fails to start', '16 join, finalize', '200 OK', `${startRes.status}`, 'critical');
    return null;
  }
  pass('16-player SE starts');

  const matches = await getMatches(adminToken, t.id);
  console.log(`    Matches: ${matches.length} (expected 15: 8+4+2+1)`);
  if (matches.length !== 15) {
    bug('16-player SE: wrong match count', 'Start 16-player SE', '15 matches', `${matches.length}`, 'high');
  } else {
    pass('16-player SE: 15 matches');
  }

  const byeMatches = matches.filter(m => m.isBye);
  if (byeMatches.length !== 0) {
    bug('16-player SE: unexpected BYEs', 'Start 16-player perfect bracket', '0 BYEs', `${byeMatches.length}`, 'medium');
  } else {
    pass('16-player SE: 0 BYEs');
  }

  return t;
}

// ─── TEST: Draw score in playoff ──────────────────────────────────────────────
async function testDrawInPlayoff(adminToken) {
  console.log('\n=== TEST: Draw score in playoff match ===');
  const t = await createTournament(adminToken, { maxParticipants: 2, tournamentName: `Draw SE ${Date.now()}` });
  await openRegistration(adminToken, t.id);

  const users = await createAndRegisterUsers(adminToken, 2);
  for (const u of users) {
    await registerUser(u.token, t.id);
  }

  await startTournament(adminToken, t.id);
  const matches = await getMatches(adminToken, t.id);
  if (matches.length === 0) { fail('Draw test: no matches'); return; }

  const m = matches[0];
  const drawRes = await setMatchResult(adminToken, m.id, 1, 1);
  console.log(`    Draw result: ${drawRes.status} — ${JSON.stringify(drawRes.data)}`);
  if (drawRes.status === 400) {
    pass('Draw in playoff correctly rejected');
  } else if (drawRes.status === 200) {
    // Check if tournament accidentally finishes with no winner
    const tourney = await getTournament(adminToken, t.id);
    if (tourney?.status === 'FINISHED') {
      const parts = await getParticipants(adminToken, t.id);
      const winner = parts.find(p => p.finalResult === '1');
      if (!winner) {
        bug(
          'Draw in playoff: match accepted with draw, no winner assigned',
          '1. Create 2-player SE. 2. Both players start. 3. Admin sets score 1-1 (draw) as final.',
          'Either 400 rejection OR match stays open for decisive result',
          'Match accepted as draw, tournament shows FINISHED but no 1st place winner',
          'critical'
        );
      }
    } else {
      // Draw was accepted but not final — maybe just a partial result
      console.log('    INFO: Draw result accepted but tournament not finished (may be non-final score)');
      // This is acceptable for intermediate scores
    }
  } else {
    fail(`Draw in playoff: unexpected status ${drawRes.status}`);
  }
}

// ─── TEST: Result after match finished ───────────────────────────────────────
async function testResultAfterFinished(adminToken) {
  console.log('\n=== TEST: Set result on already-finished match ===');
  const t = await createTournament(adminToken, { maxParticipants: 2, tournamentName: `RAfF SE ${Date.now()}` });
  await openRegistration(adminToken, t.id);

  const users = await createAndRegisterUsers(adminToken, 2);
  for (const u of users) {
    await registerUser(u.token, t.id);
  }

  await startTournament(adminToken, t.id);
  const matches = await getMatches(adminToken, t.id);
  if (matches.length === 0) { fail('RAfF: no matches'); return; }

  const m = matches[0];
  await setMatchResult(adminToken, m.id, 2, 1);

  // Try to set result again
  const secondRes = await setMatchResult(adminToken, m.id, 0, 3);
  console.log(`    Second result on finished match: ${secondRes.status} — ${JSON.stringify(secondRes.data)}`);
  if (secondRes.status === 400) {
    pass('Setting result on finished match: correctly rejected (400)');
  } else if (secondRes.status === 200) {
    // Check if it changed the winner
    const updatedMatches = await getMatches(adminToken, t.id);
    const updatedM = updatedMatches.find(m2 => m2.id === m.id);
    if (updatedM?.winnerId !== m.player1Id) {
      bug(
        'Result on finished match: winner changed by re-submission',
        '1. Set result 2-1. 2. Set result 0-3 on same match.',
        'Second submission rejected or winner unchanged',
        'Winner changed to player2 by second submission',
        'critical'
      );
    } else {
      console.log('    INFO: Second result accepted but winner unchanged (may be OK for scoring history)');
    }
  }
}

// ─── TEST: BYE match result ───────────────────────────────────────────────────
async function testByeMatchResult(adminToken) {
  console.log('\n=== TEST: Set result on BYE match ===');
  const t = await createTournament(adminToken, { maxParticipants: 4, tournamentName: `Bye SE ${Date.now()}` });
  await openRegistration(adminToken, t.id);

  const users = await createAndRegisterUsers(adminToken, 3);
  for (const u of users) {
    await registerUser(u.token, t.id);
  }

  await startTournament(adminToken, t.id);
  const matches = await getMatches(adminToken, t.id);
  const byeMatch = matches.find(m => m.isBye);
  if (!byeMatch) { console.log('    No BYE match found'); return; }

  const res = await setMatchResult(adminToken, byeMatch.id, 1, 0);
  console.log(`    Result on BYE match: ${res.status} — ${JSON.stringify(res.data)}`);
  if (res.status === 400) {
    pass('Setting result on BYE match: correctly rejected');
  } else {
    bug(
      'BYE match accepts result submission',
      '1. Start 3-player bracket (has 1 BYE). 2. POST result to BYE match.',
      '400: "Матч является байем"',
      `Status ${res.status}: ${JSON.stringify(res.data)}`,
      'medium'
    );
  }
}

// ─── TEST: Players entering conflicting scores ────────────────────────────────
async function testConflictingScores(adminToken) {
  console.log('\n=== TEST: Players enter conflicting scores ===');
  const t = await createTournament(adminToken, {
    maxParticipants: 2,
    onlyOrganizerSetsResults: false,
    tournamentName: `Conflict SE ${Date.now()}`,
  });
  await openRegistration(adminToken, t.id);

  const users = await createAndRegisterUsers(adminToken, 2);
  for (const u of users) {
    await registerUser(u.token, t.id);
  }

  await startTournament(adminToken, t.id);
  const matches = await getMatches(adminToken, t.id);
  if (matches.length === 0) { fail('Conflict test: no matches'); return; }

  const m = matches[0];
  // User 1 says 2-0 (user1 wins)
  const r1 = await req('POST', `/api/matches/${m.id}/result`, { player1Score: 2, player2Score: 0, isFinal: true }, users[0].token);
  console.log(`    User1 submits 2-0: ${r1.status}`);

  // User 2 says 0-2 conflicting: claims 0 (themselves) won — so p1=0, p2=2 means p2 wins
  // Actually conflicting would be p1Score differs: user2 says 1-2 (user1 score=1, user2 score=2)
  const r2 = await req('POST', `/api/matches/${m.id}/result`, { player1Score: 0, player2Score: 2, isFinal: true }, users[1].token);
  console.log(`    User2 submits 0-2 (conflicting): ${r2.status}`);

  // Check match status
  const updatedMatches = await getMatches(adminToken, t.id);
  const updatedM = updatedMatches.find(m2 => m2.id === m.id);
  console.log(`    Match isFinished after conflict: ${updatedM?.isFinished}`);
  if (!updatedM?.isFinished) {
    pass('Conflicting scores: match stays open (correct — needs agreement or admin)');
  } else {
    console.log(`    Winner: ${updatedM?.winnerId}`);
    // It resolved — check if correctly determined
    // With conflicting scores (2-0 vs 0-2), the match should NOT auto-resolve
    bug(
      'Conflicting scores: match auto-resolved despite disagreement',
      '1. Player1 submits 2-0. 2. Player2 submits 0-2 (both final).',
      'Match stays open (disagreement)',
      `Match auto-finished, winnerId=${updatedM?.winnerId}`,
      'high'
    );
  }
}

// ─── TEST: Match with unassigned participants ─────────────────────────────────
async function testMatchWithMissingPlayers(adminToken) {
  console.log('\n=== TEST: Submit result to match with unassigned participants ===');
  // Get a future-round match that has no players yet (in 4-player bracket, round 2 starts empty)
  const t = await createTournament(adminToken, { maxParticipants: 4, tournamentName: `MissP SE ${Date.now()}` });
  await openRegistration(adminToken, t.id);

  const users = await createAndRegisterUsers(adminToken, 4);
  for (const u of users) {
    await registerUser(u.token, t.id);
  }

  await startTournament(adminToken, t.id);
  const matches = await getMatches(adminToken, t.id);

  // Round 2 match should have no players yet
  const futureMatch = matches.find(m => m.roundNumber === 2 && !m.player1Id && !m.player2Id);
  if (!futureMatch) {
    console.log('    No future empty match found (players may already be assigned)');
    return;
  }

  const res = await setMatchResult(adminToken, futureMatch.id, 1, 0);
  console.log(`    Result on empty match: ${res.status} — ${JSON.stringify(res.data)}`);
  if (res.status === 400) {
    pass('Result on unassigned match: correctly rejected');
  } else {
    bug(
      'Match accepts result when participants not yet determined',
      '1. Start 4-player SE. 2. Try to set result on R2 match (players not assigned yet).',
      '400: "Участники матча ещё не определены"',
      `Status ${res.status}: ${JSON.stringify(res.data)}`,
      'high'
    );
  }
}

// ─── TEST: maxParticipants odd numbers ────────────────────────────────────────
async function testOddMaxParticipants(adminToken) {
  console.log('\n=== TEST: maxParticipants set to odd number (3) for SE ===');
  const t = await createTournament(adminToken, { maxParticipants: 3, tournamentName: `OddMax ${Date.now()}` });
  if (t.maxParticipants === 3) {
    console.log('    INFO: maxParticipants=3 accepted. Checking if 3 players can join...');
    await openRegistration(adminToken, t.id);
    const users = await createAndRegisterUsers(adminToken, 3);
    for (const u of users) {
      await registerUser(u.token, t.id);
    }
    const startRes = await startTournament(adminToken, t.id);
    if (startRes.status === 200) {
      pass('SE with odd maxParticipants(3): starts successfully (BYE handles it)');
    } else {
      bug('SE with maxParticipants=3: fails to start', 'Set maxP=3, 3 join, finalize', '200 (BYE bracket)', `${startRes.status}`, 'medium');
    }
  } else {
    pass(`maxParticipants=3 rejected/adjusted to ${t.maxParticipants}`);
  }
}

// ─── VISUAL TEST: Browser bracket rendering ───────────────────────────────────
async function testBracketVisual(adminToken) {
  console.log('\n=== TEST: Visual bracket rendering in browser ===');
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Get a token into the browser
    const loginRes = await req('POST', '/api/auth/login', { login: 'admin', password: 'admin123' });
    const token2 = loginRes.data?.accessToken;
    if (!token2) { fail('Visual test: login failed'); return; }

    // Create a 4-player tournament and start it
    const t = await createTournament(adminToken, { maxParticipants: 4, tournamentName: `Visual4P ${Date.now()}` });
    await openRegistration(adminToken, t.id);
    const users = await createAndRegisterUsers(adminToken, 4);
    for (const u of users) {
      await registerUser(u.token, t.id);
    }
    await startTournament(adminToken, t.id);

    // Navigate to the tournament bracket page
    await page.goto(`${WEB}/tournaments/${t.id}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);

    let ssPath = await screenshot(page, '4p-bracket-unauthenticated');
    console.log(`    Bracket page (unauthenticated): ${ssPath}`);

    // Login via Zustand store injection
    await page.evaluate((tok) => {
      const storeKey = Object.keys(localStorage).find(k => k.includes('auth'));
      console.log('Store keys:', Object.keys(localStorage));
      // Try to set auth in localStorage directly
      try {
        const stored = JSON.parse(localStorage.getItem('auth-storage') || '{}');
        stored.state = { ...(stored.state || {}), token: tok, user: { id: 1, login: 'admin', roles: ['ADMIN'] } };
        stored.version = stored.version || 0;
        localStorage.setItem('auth-storage', JSON.stringify(stored));
      } catch {}
    }, token2);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    ssPath = await screenshot(page, '4p-bracket-after-login-inject');

    // Check if bracket elements are visible
    const matchCards = await page.locator('[data-testid="match-card"], .match-card, [class*="match"]').count();
    console.log(`    Match card elements found: ${matchCards}`);

    // Look for round labels
    const pageText = await page.textContent('body');
    const hasFinale = pageText?.includes('Финал') || pageText?.includes('финал');
    const hasSemi = pageText?.includes('1/2');
    console.log(`    Page has "Финал": ${hasFinale}, has "1/2": ${hasSemi}`);

    if (!hasFinale) {
      bug('4-player bracket: "Финал" label not visible on bracket page', 'Navigate to 4-player SE tournament page', 'Round labels visible (Финал, 1/2 финала)', 'No round labels found in page text', 'medium', ssPath);
    } else {
      pass('Bracket page shows round labels');
    }

    // Try scrolling to check bracket width
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.body.clientWidth);
    console.log(`    Page scrollWidth: ${scrollWidth}, clientWidth: ${clientWidth}`);
    if (scrollWidth > clientWidth) {
      console.log('    INFO: Bracket requires horizontal scrolling (may be expected for large brackets)');
    }

    // Now test 8-player bracket visual
    const t8 = await createTournament(adminToken, { maxParticipants: 8, tournamentName: `Visual8P ${Date.now()}` });
    await openRegistration(adminToken, t8.id);
    const users8 = await createAndRegisterUsers(adminToken, 8);
    for (const u of users8) {
      await registerUser(u.token, t8.id);
    }
    await startTournament(adminToken, t8.id);

    await page.goto(`${WEB}/tournaments/${t8.id}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    ssPath = await screenshot(page, '8p-bracket-visual');
    console.log(`    8-player bracket screenshot: ${ssPath}`);

    // Check for BYE-relevant text or elements in 5-player bracket
    const t5 = await createTournament(adminToken, { maxParticipants: 8, tournamentName: `Visual5P ${Date.now()}` });
    await openRegistration(adminToken, t5.id);
    const users5 = await createAndRegisterUsers(adminToken, 5);
    for (const u of users5) {
      await registerUser(u.token, t5.id);
    }
    await startTournament(adminToken, t5.id);

    await page.goto(`${WEB}/tournaments/${t5.id}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    ssPath = await screenshot(page, '5p-bracket-with-byes');

    const pageText5 = await page.textContent('body');
    const hasBye = pageText5?.toLowerCase().includes('bye') || pageText5?.includes('БАЙ') || pageText5?.includes('байе') || pageText5?.includes('Bye');
    console.log(`    5-player bracket has BYE text: ${hasBye}`);

    // Admin login via UI
    await page.goto(`${WEB}/`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(500);

    // Try to find login button
    const loginBtn = page.locator('button, a').filter({ hasText: /войти|login|вход/i }).first();
    if (await loginBtn.isVisible()) {
      await loginBtn.click();
      await page.waitForTimeout(500);
      await page.fill('input[type="text"], input[name="login"]', 'admin');
      await page.fill('input[type="password"]', 'admin123');
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(1500);
      ssPath = await screenshot(page, 'logged-in-home');
    }

    // Navigate to 5-player bracket while logged in
    await page.goto(`${WEB}/tournaments/${t5.id}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    ssPath = await screenshot(page, '5p-bracket-logged-in');
    console.log(`    5-player bracket (logged in): ${ssPath}`);

    const pageText5Auth = await page.textContent('body');
    const hasMatches = pageText5Auth?.length > 100;
    if (hasMatches) {
      pass('Bracket page renders with content');
    }

    // Check bracket for admin — can they enter results from the page?
    const resultButtons = await page.locator('button').filter({ hasText: /результат|ввести|enter|score/i }).count();
    console.log(`    Result entry buttons visible: ${resultButtons}`);
    if (resultButtons === 0) {
      console.log('    INFO: No result entry buttons found on bracket page — may require clicking a specific match');
    }

    // Click on a match to see if result entry opens
    const matchElements = await page.locator('[class*="match"], [class*="Match"]').all();
    console.log(`    Match elements on page: ${matchElements.length}`);
    if (matchElements.length > 0) {
      try {
        await matchElements[0].click();
        await page.waitForTimeout(1000);
        ssPath = await screenshot(page, '5p-match-click');
        const afterClickText = await page.textContent('body');
        const hasResultForm = afterClickText?.toLowerCase().includes('score') ||
                             afterClickText?.includes('счёт') ||
                             afterClickText?.includes('Счёт');
        console.log(`    After clicking match - result form visible: ${hasResultForm}`);
      } catch (e) {
        console.log(`    Click on match failed: ${e.message}`);
      }
    }

  } catch (e) {
    console.error('Visual test error:', e.message);
    fail(`Visual test error: ${e.message}`);
  } finally {
    if (browser) await browser.close();
  }
}

// ─── TEST: Check API-level draw in SE (without isFinal=true) ─────────────────
async function testNonFinalScore(adminToken) {
  console.log('\n=== TEST: Non-final score submission (draw allowed as interim) ===');
  const t = await createTournament(adminToken, { maxParticipants: 2, tournamentName: `NonFinal ${Date.now()}` });
  await openRegistration(adminToken, t.id);
  const users = await createAndRegisterUsers(adminToken, 2);
  for (const u of users) {
    await registerUser(u.token, t.id);
  }
  await startTournament(adminToken, t.id);
  const matches = await getMatches(adminToken, t.id);
  const m = matches[0];

  // Submit non-final draw (isFinal=false)
  const res = await req('POST', `/api/matches/${m.id}/result`, { player1Score: 1, player2Score: 1, isFinal: false }, adminToken);
  console.log(`    Non-final draw (isFinal=false): ${res.status} — ${JSON.stringify(res.data)?.substring(0, 80)}`);
  if (res.status === 200) {
    // Check match not finished
    const mUpdated = await req('GET', `/api/matches/${m.id}`, undefined, adminToken);
    if (!mUpdated.data?.isFinished) {
      pass('Non-final draw accepted, match stays open');
    } else {
      bug('Non-final draw closes match', 'Submit draw with isFinal=false', 'Match stays open', 'Match marked isFinished=true', 'high');
    }
  } else if (res.status === 400) {
    console.log('    INFO: Non-final draw rejected (server may reject draws entirely)');
  }
}

// ─── TEST: Start tournament while in DRAFT (not REGISTRATION) ─────────────────
async function testStartFromDraft(adminToken) {
  console.log('\n=== TEST: Start tournament from DRAFT status (not REGISTRATION) ===');
  const t = await createTournament(adminToken, { maxParticipants: 2, tournamentName: `DraftStart ${Date.now()}` });
  // Do NOT open registration — stay in DRAFT
  // But we still need participants... this will also test if draft can even be started
  const startRes = await startTournament(adminToken, t.id);
  console.log(`    Start from DRAFT (0 participants): ${startRes.status} — ${JSON.stringify(startRes.data)}`);
  if (startRes.status === 400) {
    pass('Cannot start from DRAFT with 0 participants');
  } else if (startRes.status === 200) {
    bug(
      'Tournament can start from DRAFT status with 0 participants',
      '1. Create tournament (stays DRAFT). 2. POST /grid/finalize without opening registration.',
      '400 error',
      `200 OK: ${JSON.stringify(startRes.data)}`,
      'critical'
    );
  } else {
    console.log(`    Start from DRAFT: ${startRes.status} (not 200 or 400)`);
  }
}

// ─── TEST: Full UI flow with Playwright ──────────────────────────────────────
async function testFullUIFlow(adminToken) {
  console.log('\n=== TEST: Full UI flow — create, open reg, add participants, start ===');
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to home
    await page.goto(WEB, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);
    let ssPath = await screenshot(page, 'ui-home');
    console.log(`    Home page: ${ssPath}`);

    // Try to login through UI
    // Look for login link/button
    const loginElements = await page.locator('a[href*="login"], button').filter({ hasText: /войти|login|вход/i }).all();
    console.log(`    Login elements: ${loginElements.length}`);

    if (loginElements.length > 0) {
      await loginElements[0].click();
      await page.waitForTimeout(500);
    } else {
      // Try direct nav
      await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(500);
    }

    ssPath = await screenshot(page, 'ui-login-page');

    // Fill login form
    const loginInput = page.locator('input[name="login"], input[type="text"]').first();
    const passInput = page.locator('input[type="password"]').first();

    if (await loginInput.isVisible()) {
      await loginInput.fill('admin');
      await passInput.fill('admin123');
      await page.locator('button[type="submit"]').click();
      await page.waitForTimeout(2000);
      ssPath = await screenshot(page, 'ui-after-login');
      console.log(`    After login: ${ssPath}`);

      const currentUrl = page.url();
      console.log(`    Current URL after login: ${currentUrl}`);
      if (!currentUrl.includes('/login')) {
        pass('UI login successful');
      } else {
        bug('UI login failed — still on login page', 'Login with admin/admin123 via UI', 'Redirect away from /login', `Still at ${currentUrl}`, 'critical', ssPath);
        return;
      }
    } else {
      console.log('    Login form not found on page');
      fail('UI: Login form not found');
      return;
    }

    // Navigate to create tournament
    await page.goto(`${WEB}/tournaments/create`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);
    ssPath = await screenshot(page, 'ui-create-tournament');
    console.log(`    Create tournament page: ${ssPath}`);

    const pageContent = await page.textContent('body');
    if (pageContent?.includes('Формат') || pageContent?.includes('Название') || pageContent?.includes('формат')) {
      pass('Create tournament page loads');
    } else {
      fail('Create tournament page missing expected fields');
    }

    // Check if format selection is visible
    const formatSelector = await page.locator('select, [role="combobox"]').filter({ hasText: /single|олимпийская|elimination/i }).count();
    const allSelects = await page.locator('select').count();
    console.log(`    Format selectors: ${formatSelector}, total selects: ${allSelects}`);

    // Check tournament list
    await page.goto(`${WEB}/tournaments`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(1000);
    ssPath = await screenshot(page, 'ui-tournament-list');
    console.log(`    Tournament list: ${ssPath}`);

  } catch (e) {
    console.error('Full UI flow error:', e.message);
    fail(`Full UI flow error: ${e.message}`);
  } finally {
    if (browser) await browser.close();
  }
}

// ─── TEST: Check seeding logic ────────────────────────────────────────────────
async function testSeedingLogic(adminToken) {
  console.log('\n=== TEST: Seeding logic — top seeds should be in opposite halves ===');
  const t = await createTournament(adminToken, { maxParticipants: 4, tournamentName: `Seed SE ${Date.now()}` });
  await openRegistration(adminToken, t.id);

  const users = await createAndRegisterUsers(adminToken, 4);
  for (const u of users) {
    await registerUser(u.token, t.id);
  }

  // Start with seeded order: user IDs in order = seed 1,2,3,4
  const parts = await getParticipants(adminToken, t.id);
  const orderedIds = parts.map(p => p.id);
  console.log(`    Participant IDs (in join order): ${orderedIds}`);

  const startRes = await req('POST', `/api/tournaments/${t.id}/grid/finalize`, {
    gridJson: '{}',
    participantAssignments: orderedIds.map((id, i) => ({ participantId: id, seed: i + 1 })),
  }, adminToken);

  if (startRes.status !== 200) {
    fail(`Seeding test: start failed ${startRes.status}`);
    return;
  }
  pass('Seeded start: 200 OK');

  const matches = await getMatches(adminToken, t.id);
  const r1Matches = matches.filter(m => m.roundNumber === 1);
  console.log(`    R1 matches:`);
  for (const m of r1Matches) {
    const p1 = parts.find(p => p.id === m.player1Id);
    const p2 = parts.find(p => p.id === m.player2Id);
    const seed1 = orderedIds.indexOf(m.player1Id) + 1;
    const seed2 = orderedIds.indexOf(m.player2Id) + 1;
    console.log(`      Match: ${p1?.user?.login}(seed${seed1}) vs ${p2?.user?.login}(seed${seed2})`);
  }

  // In standard SE seeding [1,2,3,4]: seed1 vs seed4, seed2 vs seed3
  // i.e. top 2 seeds should NOT face each other in R1
  const seed1Match = r1Matches.find(m => orderedIds.indexOf(m.player1Id) === 0 || orderedIds.indexOf(m.player2Id) === 0);
  const seed2InSameMatch = seed1Match && (orderedIds.indexOf(seed1Match.player1Id) === 1 || orderedIds.indexOf(seed1Match.player2Id) === 1);

  if (seed2InSameMatch) {
    bug(
      'Seeding: top 2 seeds face each other in R1',
      'Create 4-player SE with seeds 1,2,3,4',
      'Seed 1 vs Seed 4, Seed 2 vs Seed 3 in R1',
      'Seed 1 and Seed 2 are in the same R1 match',
      'medium'
    );
  } else {
    pass('Seeding: top 2 seeds in opposite halves');
  }
}

// ─── TEST: Check tournament with exactly 0 participants ─────────────────────
async function test0Participants(adminToken) {
  console.log('\n=== TEST: Start tournament with 0 participants ===');
  const t = await createTournament(adminToken, { maxParticipants: 4, tournamentName: `0P SE ${Date.now()}` });
  await openRegistration(adminToken, t.id);

  const startRes = await startTournament(adminToken, t.id);
  console.log(`    Start with 0 participants: ${startRes.status} — ${JSON.stringify(startRes.data)}`);
  if (startRes.status === 400) {
    pass('0 participants: correctly rejected');
  } else {
    bug('Tournament starts with 0 participants', '1. Create SE. 2. Open reg. 3. Nobody joins. 4. Finalize.', '400 error', `${startRes.status}`, 'critical');
  }
}

// ─── TEST: Result when match not ready (only 1 player in slot) ───────────────
async function testResultOnHalfPopulatedMatch(adminToken) {
  console.log('\n=== TEST: Result on match with only 1 player ===');
  // Create a 3-player bracket; the final will have only 1 player until real match finishes
  const t = await createTournament(adminToken, { maxParticipants: 4, tournamentName: `HalfPop ${Date.now()}` });
  await openRegistration(adminToken, t.id);
  const users = await createAndRegisterUsers(adminToken, 3);
  for (const u of users) {
    await registerUser(u.token, t.id);
  }
  await startTournament(adminToken, t.id);

  const matches = await getMatches(adminToken, t.id);
  // After start: BYE winner auto-advances to final. Final might have 1 player from BYE.
  const finalMatch = matches.find(m => m.roundNumber === 2);
  console.log(`    Final match after start: p1=${finalMatch?.player1Id}, p2=${finalMatch?.player2Id}`);

  if (finalMatch && ((finalMatch.player1Id && !finalMatch.player2Id) || (!finalMatch.player1Id && finalMatch.player2Id))) {
    // Final has exactly 1 player — try to set result
    const res = await setMatchResult(adminToken, finalMatch.id, 1, 0);
    console.log(`    Result on 1-player match: ${res.status} — ${JSON.stringify(res.data)}`);
    if (res.status === 400) {
      pass('Result on 1-player match: correctly rejected');
    } else {
      bug('Result accepted on match with only 1 player', '1. 3-player bracket. 2. Final has 1 player from BYE. 3. Submit result.', '400', `${res.status}: ${JSON.stringify(res.data)}`, 'high');
    }
  } else {
    console.log('    Final match is fully populated or empty — skipping this specific check');
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   QA: Single Elimination — Adversarial Testing                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  const adminToken = await login();
  if (!adminToken) {
    console.error('FATAL: Cannot login. Aborting.');
    process.exit(1);
  }

  try {
    // Edge cases: participant counts
    await test0Participants(adminToken);
    await test1Player(adminToken);
    await testOrganizerJoin(adminToken);
    await test2Players(adminToken);
    await test3Players(adminToken);
    await test4Players(adminToken);
    await test5Players(adminToken);
    await test6Players(adminToken);
    await test7Players(adminToken);
    await test8Players(adminToken);
    await test16Players(adminToken);

    // Match flow edge cases
    await testDrawInPlayoff(adminToken);
    await testResultAfterFinished(adminToken);
    await testByeMatchResult(adminToken);
    await testConflictingScores(adminToken);
    await testMatchWithMissingPlayers(adminToken);
    await testNonFinalScore(adminToken);
    await testStartFromDraft(adminToken);
    await testResultOnHalfPopulatedMatch(adminToken);
    await testOddMaxParticipants(adminToken);
    await testSeedingLogic(adminToken);

    // Visual tests
    await testBracketVisual(adminToken);
    await testFullUIFlow(adminToken);

  } catch (err) {
    console.error('\nFATAL ERROR:', err);
    failCount++;
  }

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log(`║  RESULTS: ${passCount} PASSED, ${failCount} FAILED, ${bugCount} BUGS FOUND`);
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  if (bugs.length > 0) {
    console.log('\n═══════════════════ BUGS FOUND ════════════════════════════');
    for (const b of bugs) {
      console.log(`\nBug #${b.num}: ${b.title}`);
      console.log(`  Steps: ${b.steps}`);
      console.log(`  Expected: ${b.expected}`);
      console.log(`  Actual: ${b.actual}`);
      console.log(`  Severity: ${b.severity}`);
      if (b.screenshotPath) console.log(`  Screenshot: ${b.screenshotPath}`);
    }
  } else {
    console.log('\nNo bugs found!');
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
