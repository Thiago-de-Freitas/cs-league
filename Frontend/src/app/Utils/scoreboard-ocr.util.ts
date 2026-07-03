import { createWorker } from 'tesseract.js';

export interface OcrPlayerRow {
  name: string;
  kills: number;
  deaths: number;
  assists: number;
  hsPercent: number;
  damage: number;
}

export interface ScoreboardOcrResult {
  players: OcrPlayerRow[];
  rawText: string;
}

/** Alvo de preenchimento (linha do formulário de stats manuais). */
export interface OcrFillTarget {
  playerName: string;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  hsPercent: number | null;
  damage: number | null;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

/**
 * Roda OCR (Tesseract.js) sobre um print do placar final do CS2 e devolve as
 * linhas de jogadores reconhecidas. Os valores devem ser sempre revisados antes
 * de salvar — OCR é uma sugestão, não uma fonte confiável.
 */
export async function runScoreboardOcr(
  file: File,
  onProgress?: (progress: number) => void
): Promise<ScoreboardOcrResult> {
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(m.progress);
      }
    },
  });
  try {
    const dataUrl = await fileToDataUrl(file);
    const { data } = await worker.recognize(dataUrl);
    return parseScoreboardText(data.text);
  } finally {
    await worker.terminate();
  }
}

/** Extrai o nome do jogador removendo colunas numéricas (rank/nível à esquerda, stats à direita). */
function extractName(line: string): string {
  let s = line.trim();
  s = s.replace(/^(?:\s*\d+\b)+/, '');
  s = s.replace(/(?:\s+[\d.]+%?)+\s*$/, '');
  s = s.replace(/^[^A-Za-z0-9]+/, '').replace(/[^A-Za-z0-9_. ]+$/, '');
  return s.trim();
}

function hasLetter(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

/**
 * Interpreta o texto bruto do OCR. Cada linha de jogador tem o padrão:
 * `[rank] [nível] Nome  Vítimas Mortes Assist. %TC Dano`.
 * Tomamos os 5 últimos números da linha como as estatísticas.
 */
export function parseScoreboardText(text: string): ScoreboardOcrResult {
  const lines = text.split(/\r?\n/);
  const players: OcrPlayerRow[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const numMatches = line.match(/\d+/g);
    if (!numMatches || numMatches.length < 5) continue;

    const nums = numMatches.map((n) => Number(n));
    const [kills, deaths, assists, hsPercent, damage] = nums.slice(-5);

    if (hsPercent > 100) continue;
    if (kills === 0 && deaths === 0 && assists === 0 && damage === 0) continue;

    const name = extractName(line);
    if (!name || name.length < 2 || !hasLetter(name)) continue;

    players.push({ name, kills, deaths, assists, hsPercent, damage });
  }

  return { players, rawText: text };
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Similaridade 0..1 entre dois nomes já normalizados. */
function nameScore(ocr: string, target: string): number {
  if (!ocr || !target) return 0;
  if (ocr === target) return 1;
  if (target.includes(ocr) || ocr.includes(target)) return 0.9;
  const dist = levenshtein(ocr, target);
  const maxLen = Math.max(ocr.length, target.length);
  return 1 - dist / maxLen;
}

/**
 * Casa as linhas do OCR com as linhas do formulário (roster) por similaridade de
 * nome e preenche os valores. Não sobrescreve caso não haja bom casamento.
 * Retorna quantos jogadores foram preenchidos e os nomes não reconhecidos.
 */
export function applyScoreboardOcrToDrafts(
  ocrPlayers: OcrPlayerRow[],
  drafts: OcrFillTarget[]
): { matched: number; unmatched: string[] } {
  const MIN_SCORE = 0.6;
  const usedDrafts = new Set<OcrFillTarget>();
  const unmatched: string[] = [];
  let matched = 0;

  for (const ocr of ocrPlayers) {
    const ocrNorm = normalizeName(ocr.name);
    let best: OcrFillTarget | null = null;
    let bestScore = 0;

    for (const draft of drafts) {
      if (usedDrafts.has(draft)) continue;
      const score = nameScore(ocrNorm, normalizeName(draft.playerName));
      if (score > bestScore) {
        bestScore = score;
        best = draft;
      }
    }

    if (best && bestScore >= MIN_SCORE) {
      best.kills = ocr.kills;
      best.deaths = ocr.deaths;
      best.assists = ocr.assists;
      best.hsPercent = ocr.hsPercent;
      best.damage = ocr.damage;
      usedDrafts.add(best);
      matched++;
    } else {
      unmatched.push(ocr.name);
    }
  }

  return { matched, unmatched };
}
