/**
 * Smoke test da visualização do bracket (lógica espelhada do Frontend).
 * Valida que vencedores das quartas não aparecem com W na semifinal antes do jogo.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bracketUtilPath = join(__dirname, '../../Frontend/src/app/Utils/bracket.util.ts');
const mod = await import(pathToFileURL(bracketUtilPath).href);
const { buildBracketView } = mod;

const teams = [
  { id: 'bt', name: 'Binary Titans', tag: 'BT', wins: 0, losses: 0, points: 0, seed: 1 },
  { id: 'aa', name: 'Algorithm Assassins', tag: 'AA', wins: 0, losses: 0, points: 0, seed: 2 },
  { id: 'ck', name: 'Cloud Knights', tag: 'CK', wins: 0, losses: 0, points: 0, seed: 3 },
  { id: 'bb', name: 'Bug Busters', tag: 'BB', wins: 0, losses: 0, points: 0, seed: 4 },
  { id: 'cw', name: 'Code Warriors', tag: 'CW', wins: 0, losses: 0, points: 0, seed: 5 },
];

const matches = [
  {
    id: 'm2',
    round: 1,
    bracketPosition: 2,
    status: 'completed',
    team1: { id: 'aa', name: 'Algorithm Assassins', tag: 'AA' },
    team2: { id: 'cw', name: 'Code Warriors', tag: 'CW' },
    winnerId: 'aa',
  },
  {
    id: 'm3',
    round: 1,
    bracketPosition: 3,
    status: 'completed',
    team1: { id: 'ck', name: 'Cloud Knights', tag: 'CK' },
    team2: { id: 'ss', name: 'Syntax Slayers', tag: 'SS' },
    winnerId: 'ck',
  },
  {
    id: 'm4',
    round: 1,
    bracketPosition: 4,
    status: 'completed',
    team1: { id: 'bb', name: 'Bug Busters', tag: 'BB' },
    team2: { id: 'pr', name: 'Pixel Rangers', tag: 'PR' },
    winnerId: 'bb',
  },
];

const view = buildBracketView(teams, 5, 8, matches);
const semi = view.columns.find((c) => c.label === 'Semifinais');
const semi1 = semi?.matches[0];

if (!semi1) {
  console.error('FAIL: semifinal não encontrada');
  process.exit(1);
}

const aaInSemi = [semi1.teamA, semi1.teamB].find((t) => t.teamId === 'aa');
const btInSemi = [semi1.teamA, semi1.teamB].find((t) => t.teamId === 'bt');

if (!aaInSemi || !btInSemi) {
  console.error('FAIL: BT ou AA não aparecem na semifinal prevista', semi1);
  process.exit(1);
}

if (aaInSemi.isWinner) {
  console.error('FAIL: AA aparece como vencedor na semifinal antes do jogo');
  process.exit(1);
}

if (btInSemi.isWinner) {
  console.error('FAIL: BT aparece como vencedor na semifinal antes do jogo');
  process.exit(1);
}

if (semi1.status === 'completed') {
  console.error('FAIL: semifinal marcada como completed sem jogo no banco');
  process.exit(1);
}

console.log('OK: bracket view — semifinal sem W prematuro (BT vs AA, status agendado)');
