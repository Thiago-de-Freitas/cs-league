/**
 * Testa ligas com quantidades ímpares e pares de times:
 * - Eliminação simples: bracket, BYEs e avanço após R1
 * - Fase de grupos (grupo único): round-robin e calendário
 */
const BASE = process.env.API_URL ?? 'http://localhost:3000';

async function api(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${data.error ?? JSON.stringify(data)}`);
  }
  return data;
}

function fairBracketSize(n) {
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

function expectedWalkovers(teamCount) {
  return fairBracketSize(teamCount) - teamCount;
}

function expectedRound1Matches(teamCount) {
  return fairBracketSize(teamCount) / 2 - expectedWalkovers(teamCount);
}

function roundRobinCount(n) {
  return (n * (n - 1)) / 2;
}

function getAllMatches(league) {
  const top = league.matches ?? [];
  const fromGroups = (league.groups ?? []).flatMap((g) => g.matches ?? []);
  return top.length > 0 ? top : fromGroups;
}

function isGroupPhase(m) {
  return (m.phase ?? '').toLowerCase() === 'group';
}

function isPlayoff(m) {
  return (m.phase ?? '').toLowerCase() === 'playoff' || (m.round ?? 0) > 0;
}

function analyzeEliminationBracket(league) {
  const playoff = getAllMatches(league).filter(isPlayoff);
  const round1 = playoff.filter((m) => m.round === 1);
  const later = playoff.filter((m) => m.round > 1);
  const walkoverTeams = new Set();
  const bracketSize = league.bracketSize ?? fairBracketSize(league.teams?.length ?? 0);

  const teamsInR1 = new Set();
  for (const m of round1) {
    if (m.team1?.id) teamsInR1.add(m.team1.id);
    if (m.team2?.id) teamsInR1.add(m.team2.id);
  }
  for (const t of league.teams ?? []) {
    if (!teamsInR1.has(t.id)) walkoverTeams.add(t.tag ?? t.id);
  }

  const prematureWinners = later.filter(
    (m) => (m.status ?? '').toLowerCase() !== 'completed' && m.winnerId
  );

  return {
    teamCount: league.teams?.length ?? 0,
    bracketSize,
    round1Count: round1.length,
    laterRounds: later.length,
    walkoverCount: walkoverTeams.size,
    walkoverTags: [...walkoverTeams],
    prematureWinners: prematureWinners.length,
    allScheduledHaveBothTeams: round1.every((m) => m.team1 && m.team2),
    round1Matches: round1,
    laterMatches: later,
  };
}

function analyzeGroupStage(league) {
  const groupMatches = getAllMatches(league).filter(isGroupPhase);
  const teamIds = new Set((league.teams ?? []).map((t) => t.id));
  const n = teamIds.size;
  const expected = roundRobinCount(n);
  const scheduled = groupMatches.filter((m) => m.scheduledAt).length;
  const pairs = new Set();
  for (const m of groupMatches) {
    const key = [m.team1?.id ?? m.team1Id, m.team2?.id ?? m.team2Id].sort().join('|');
    pairs.add(key);
  }
  return {
    teamCount: n,
    matchCount: groupMatches.length,
    expectedMatches: expected,
    uniquePairs: pairs.size,
    allScheduled: groupMatches.length > 0 && scheduled === groupMatches.length,
    hasEndDate: Boolean(league.endDate),
    rounds: [...new Set(groupMatches.map((m) => m.groupRound))].sort((a, b) => a - b),
  };
}

async function createEliminationLeague(token, teamIds, name) {
  const league = await api('POST', '/api/leagues', token, {
    name,
    format: 'SINGLE_ELIMINATION',
    status: 'UPCOMING',
  });
  await api('POST', `/api/leagues/${league.id}/teams/bulk`, token, { teamIds });
  const result = await api('POST', `/api/leagues/${league.id}/bracket/generate`, token, {});
  const full = await api('GET', `/api/leagues/${league.id}`, token);
  return { league: full, bracketInfo: result.bracketInfo };
}

async function createGroupLeague(token, teamIds, name) {
  const league = await api('POST', '/api/leagues', token, {
    name,
    format: 'GROUP_STAGE',
    groupCount: 1,
    advancePerGroup: 2,
    startDate: '2026-07-01',
    status: 'UPCOMING',
  });
  await api('POST', `/api/leagues/${league.id}/teams/bulk`, token, { teamIds });
  await api('PUT', `/api/leagues/${league.id}/schedule`, token, {
    startDate: '2026-07-01',
    defaultMatchDays: [1, 3, 5],
    defaultMatchTime: '20:00',
    scheduleTimezone: 'America/Sao_Paulo',
  });
  const result = await api('POST', `/api/leagues/${league.id}/groups/generate`, token, {});
  const full = await api('GET', `/api/leagues/${league.id}`, token);
  return { league: full, groupInfo: result.groupInfo };
}

async function completeRound1(token, league) {
  const analysis = analyzeEliminationBracket(league);
  for (const m of analysis.round1Matches) {
    await api('PATCH', `/api/matches/${m.id}/result`, token, {
      winnerId: m.team1.id,
      team1Score: 16,
      team2Score: 10,
    });
  }
  return api('GET', `/api/leagues/${league.id}`, token);
}

async function testByeAdvancement(token, allTeamIds, n) {
  const teamIds = allTeamIds.slice(0, n);
  const { league: initial } = await createEliminationLeague(
    token,
    teamIds,
    `Test BYE advance ${n}`
  );
  const league = await completeRound1(token, initial);
  const after = analyzeEliminationBracket(league);

  assert(after.prematureWinners === 0, `${n} times pós-R1: vencedor prematuro`);
  const scheduledLater = after.laterMatches.filter(
    (m) => (m.status ?? '').toLowerCase() === 'scheduled'
  );
  assert(scheduledLater.length > 0, `${n} times pós-R1: nenhuma partida futura agendada`);
  for (const m of scheduledLater) {
    assert(m.team1 && m.team2, `${n} times pós-R1: confronto incompleto na rodada ${m.round}`);
    assert(!m.winnerId, `${n} times pós-R1: winnerId em jogo não finalizado`);
  }
  return after;
}

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  const login = await api('POST', '/api/auth/login', null, {
    email: 'admin@test.com',
    password: '123456',
  });
  const token = login.token;

  const tempLeague = await api('POST', '/api/leagues', token, {
    name: '_temp_team_pool',
    format: 'SINGLE_ELIMINATION',
  });
  const available = await api('GET', `/api/leagues/${tempLeague.id}/available-teams`, token);
  const allTeamIds = available.map((t) => t.id);
  assert(allTeamIds.length >= 8, `precisa de pelo menos 8 times no banco (tem ${allTeamIds.length})`);

  const counts = [3, 4, 5, 6, 7, 8];
  let passed = 0;
  let failed = 0;

  console.log('\n=== ELIMINAÇÃO SIMPLES — geração (ímpar vs par) ===\n');

  for (const n of counts) {
    const label = n % 2 === 0 ? 'par' : 'ímpar';
    const teamIds = allTeamIds.slice(0, n);
    try {
      const { league, bracketInfo } = await createEliminationLeague(
        token,
        teamIds,
        `Test Elim ${n} (${label})`
      );
      const analysis = analyzeEliminationBracket(league);

      assert(analysis.teamCount === n, `${n} times: contagem errada`);
      assert(
        analysis.bracketSize === fairBracketSize(n),
        `${n} times: bracketSize esperado ${fairBracketSize(n)}, got ${analysis.bracketSize}`
      );
      assert(
        bracketInfo.walkovers === expectedWalkovers(n),
        `${n} times: walkovers esperado ${expectedWalkovers(n)}, got ${bracketInfo.walkovers}`
      );
      assert(
        bracketInfo.round1Matches === expectedRound1Matches(n),
        `${n} times: R1 esperado ${expectedRound1Matches(n)}, got ${bracketInfo.round1Matches}`
      );
      assert(analysis.allScheduledHaveBothTeams, `${n} times: jogo R1 sem dois times`);
      assert(analysis.prematureWinners === 0, `${n} times: vencedor prematuro em rodada futura`);
      assert(
        analysis.walkoverCount === expectedWalkovers(n),
        `${n} times: ${analysis.walkoverCount} BYEs, esperado ${expectedWalkovers(n)}`
      );

      console.log(
        `✓ ${n} times (${label}): bracket=${analysis.bracketSize}, R1=${analysis.round1Count}, BYEs=${bracketInfo.walkovers}`
      );
      passed++;
    } catch (e) {
      console.error(`✗ ${n} times (${label}): ${e.message}`);
      failed++;
    }
  }

  console.log('\n=== ELIMINAÇÃO SIMPLES — avanço pós-R1 (ímpares com BYE) ===\n');

  for (const n of [3, 5, 7]) {
    try {
      const after = await testByeAdvancement(token, allTeamIds, n);
      console.log(
        `✓ ${n} times (ímpar): ${after.laterRounds} jogos futuros, sem W prematuro`
      );
      passed++;
    } catch (e) {
      console.error(`✗ ${n} times (ímpar pós-R1): ${e.message}`);
      failed++;
    }
  }

  console.log('\n=== FASE DE GRUPOS — grupo único (ímpar vs par) ===\n');

  for (const n of counts) {
    const label = n % 2 === 0 ? 'par' : 'ímpar';
    const teamIds = allTeamIds.slice(0, n);
    try {
      const { league, groupInfo } = await createGroupLeague(
        token,
        teamIds,
        `Test Grupo ${n} (${label})`
      );
      const analysis = analyzeGroupStage(league);
      const expected = roundRobinCount(n);

      assert(analysis.teamCount === n, `${n} times: contagem errada`);
      assert(
        analysis.matchCount === expected,
        `${n} times: ${analysis.matchCount} jogos, esperado ${expected}`
      );
      assert(
        analysis.uniquePairs === expected,
        `${n} times: pares únicos ${analysis.uniquePairs}, esperado ${expected}`
      );
      assert(
        groupInfo.totalMatches === expected,
        `${n} times: API totalMatches ${groupInfo.totalMatches}`
      );
      assert(analysis.allScheduled, `${n} times: nem todos os jogos têm scheduledAt`);
      assert(analysis.hasEndDate, `${n} times: endDate não definido`);

      console.log(
        `✓ ${n} times (${label}): ${analysis.matchCount} jogos, ${analysis.rounds.length} rodadas, endDate=${String(league.endDate).slice(0, 10)}`
      );
      passed++;
    } catch (e) {
      console.error(`✗ ${n} times (${label}): ${e.message}`);
      failed++;
    }
  }

  console.log(`\n=== RESUMO: ${passed} passou, ${failed} falhou ===\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
