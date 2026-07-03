import { createWorker, PSM } from 'tesseract.js';

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

/** Largura mínima alvo após upscale: OCR degrada muito em imagens pequenas. */
const OCR_TARGET_WIDTH = 1600;
/** Acima deste valor a imagem é considerada de fundo escuro (texto claro) e é invertida. */
const DARK_BACKGROUND_MEAN = 140;

async function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível carregar a imagem.'));
    img.src = dataUrl;
  });
}

/**
 * Pré-processa o print para melhorar o OCR:
 * 1) amplia imagens pequenas (upscale) para dar mais pixels ao Tesseract;
 * 2) converte para tons de cinza;
 * 3) inverte quando o fundo é escuro (placar do CS2 é texto claro sobre fundo escuro);
 * 4) normaliza o contraste (stretch entre percentis) para aproximar de preto sobre branco.
 * Se o canvas não estiver disponível, cai de volta para a imagem original.
 */
async function preprocessImage(file: File): Promise<string> {
  try {
    const original = await fileToDataUrl(file);
    const img = await loadImageElement(original);
    if (!img.width || !img.height) return original;

    const scale = img.width < OCR_TARGET_WIDTH ? OCR_TARGET_WIDTH / img.width : 1;
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Passo 1: tons de cinza + histograma.
    const gray = new Uint8ClampedArray(width * height);
    const histogram = new Array(256).fill(0);
    let sum = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const g = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      gray[p] = g;
      histogram[g]++;
      sum += g;
    }
    const mean = sum / gray.length;
    const invert = mean < DARK_BACKGROUND_MEAN;

    // Passo 2: percentis 5% / 95% para stretch de contraste robusto a outliers.
    const total = gray.length;
    const lowCut = total * 0.05;
    const highCut = total * 0.95;
    let acc = 0;
    let low = 0;
    let high = 255;
    for (let v = 0; v < 256; v++) {
      acc += histogram[v];
      if (acc >= lowCut) { low = v; break; }
    }
    acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += histogram[v];
      if (acc >= highCut) { high = v; break; }
    }
    const range = Math.max(1, high - low);

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      let v = ((gray[p] - low) / range) * 255;
      v = Math.max(0, Math.min(255, v));
      if (invert) v = 255 - v;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    // Qualquer falha no pré-processamento não deve impedir o OCR.
    return fileToDataUrl(file);
  }
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
    await worker.setParameters({
      // Assume um bloco uniforme de texto (as linhas do placar).
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
    });
    const dataUrl = await preprocessImage(file);
    const { data } = await worker.recognize(dataUrl);
    return parseScoreboardText(data.text);
  } finally {
    await worker.terminate();
  }
}

/** Token numérico do placar: inteiro ou decimal, com % opcional (ex.: "24", "58%", "89.4"). */
const NUMBER_TOKEN = /\d+(?:[.,]\d+)?%?/g;

/** Extrai o nome do jogador removendo colunas numéricas (rank/nível à esquerda, stats à direita). */
function extractName(line: string): string {
  let s = line.trim();
  // remove blocos numéricos no início (patente/nível) e no fim (colunas de stats).
  s = s.replace(/^(?:[\s|]*\d+(?:[.,]\d+)?%?\b)+/, '');
  s = s.replace(/(?:[\s|]+\d+(?:[.,]\d+)?%?)+\s*$/, '');
  // remove pontuação/ruído nas pontas, preservando letras, dígitos e alguns símbolos de nick.
  s = s.replace(/^[^A-Za-z0-9]+/, '').replace(/[^A-Za-z0-9_.\- ]+$/, '');
  return s.trim();
}

function hasLetter(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

function countLetters(value: string): number {
  return (value.match(/[A-Za-z]/g) ?? []).length;
}

/** Converte um token ("58%", "89,4") em inteiro; retorna NaN se inválido. */
function toInt(token: string): number {
  const n = Number(token.replace('%', '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

/** Descarta linhas cujos valores estão fora de faixas plausíveis de um placar de CS2. */
function isPlausibleRow(row: OcrPlayerRow): boolean {
  const inRange = (v: number, max: number) => Number.isFinite(v) && v >= 0 && v <= max;
  if (!inRange(row.kills, 99)) return false;
  if (!inRange(row.deaths, 99)) return false;
  if (!inRange(row.assists, 99)) return false;
  if (!inRange(row.hsPercent, 100)) return false;
  if (!inRange(row.damage, 9999)) return false;
  // linha toda zerada normalmente é ruído de OCR.
  if (row.kills === 0 && row.deaths === 0 && row.assists === 0 && row.damage === 0) return false;
  // dano costuma ser o maior valor; se for minúsculo comparado a kills, provável leitura errada.
  if (row.damage > 0 && row.damage < row.kills) return false;
  return true;
}

/**
 * Interpreta o texto bruto do OCR. Cada linha de jogador tem o padrão:
 * `[patente] [nível] Nome  Vítimas Mortes Assist. %TC Dano`.
 * Tomamos os 5 últimos números da linha como as estatísticas e aplicamos
 * filtros de sanidade para descartar linhas que claramente são ruído.
 */
export function parseScoreboardText(text: string): ScoreboardOcrResult {
  const lines = text.split(/\r?\n/);
  const players: OcrPlayerRow[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const numMatches = line.match(NUMBER_TOKEN);
    if (!numMatches || numMatches.length < 5) continue;

    const nums = numMatches.slice(-5).map(toInt);
    if (nums.some((n) => Number.isNaN(n))) continue;
    const [kills, deaths, assists, hsPercent, damage] = nums;

    const name = extractName(line);
    // exige um nome com pelo menos 2 letras (evita casar só com pontuação/números).
    if (!name || countLetters(name) < 2 || !hasLetter(name)) continue;

    const row: OcrPlayerRow = { name, kills, deaths, assists, hsPercent, damage };
    if (!isPlausibleRow(row)) continue;

    players.push(row);
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
