const CLIP_PADDING_TICKS = 64 * 5;

export function computeClipTicks(centerTick: number | null): {
  clipStartTick: number | null;
  clipEndTick: number | null;
} {
  if (centerTick == null || centerTick <= 0) {
    return { clipStartTick: null, clipEndTick: null };
  }
  return {
    clipStartTick: Math.max(0, centerTick - CLIP_PADDING_TICKS),
    clipEndTick: centerTick + CLIP_PADDING_TICKS,
  };
}

export function buildVdmClipSpec(input: {
  clipStartTick: number;
  clipEndTick: number;
  playerName: string;
  round: number;
  description: string;
}): string {
  const lines = [
    '// Gamers League — especificação de clipe para HLAE / demo tools',
    `// Jogador: ${input.playerName} · Round ${input.round}`,
    `// ${input.description}`,
    `// Reproduza a demo e use os ticks abaixo (64 tick/s ≈ 5s de margem)`,
    '',
    `mirv_cmd addAtTick ${input.clipStartTick} "demo_gototick ${input.clipStartTick}"`,
    `mirv_cmd addAtTick ${input.clipStartTick} "mirv_demo pause"`,
    `mirv_cmd addAtTick ${input.clipEndTick} "mirv_demo pause"`,
    '',
    `// Intervalo: tick ${input.clipStartTick} → ${input.clipEndTick}`,
  ];
  return lines.join('\n');
}
