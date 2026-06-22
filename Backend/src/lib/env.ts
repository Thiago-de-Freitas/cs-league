function isUnresolvedRailwayRef(value: string): boolean {
  return value.includes('${{') || value.includes('{{');
}

/** Retorna lista de erros de configuração em produção (não derruba o processo). */
export function getProductionEnvErrors(): string[] {
  if (process.env.NODE_ENV !== 'production') {
    return [];
  }

  const errors: string[] = [];

  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  if (!corsOrigin) {
    errors.push('CORS_ORIGIN deve ser definido (URL pública da API, ex.: https://seu-app.up.railway.app)');
  } else if (isUnresolvedRailwayRef(corsOrigin)) {
    errors.push('CORS_ORIGIN não foi resolvida — use a URL pública do serviço, não uma referência inválida');
  }

  const jwt = process.env.JWT_SECRET;
  if (!jwt || jwt === 'dev-secret' || jwt.length < 32) {
    errors.push('JWT_SECRET deve ter pelo menos 32 caracteres aleatórios (ex.: openssl rand -hex 32)');
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    errors.push('DATABASE_URL deve ser definido (referência ${{Postgres.DATABASE_URL}})');
  } else if (isUnresolvedRailwayRef(databaseUrl)) {
    errors.push('DATABASE_URL não foi resolvida — vincule o plugin Postgres ao serviço API');
  }

  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    errors.push('REDIS_URL deve ser definido (referência ${{Redis.REDIS_URL}})');
  } else if (isUnresolvedRailwayRef(redisUrl)) {
    errors.push('REDIS_URL não foi resolvida — vincule o plugin Redis ao serviço API (Add Reference → Redis → REDIS_URL)');
  } else {
    logRedisUrlWarnings(redisUrl);
  }

  return errors;
}

/** Registra erros de env em stderr (usado após o servidor subir). */
export function logProductionEnvErrors(errors: string[]): void {
  if (errors.length === 0) {
    return;
  }
  console.error('[startup] Variáveis de ambiente ausentes ou inválidas:');
  for (const message of errors) {
    console.error(`[startup]   - ${message}`);
  }
}

/** Avisos sobre REDIS_URL mal configurada (não bloqueia o startup). */
export function logRedisUrlWarnings(redisUrl: string): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  let hostname: string;
  try {
    hostname = new URL(redisUrl).hostname;
  } catch {
    console.warn(
      '[startup] REDIS_URL tem formato inválido — use a referência ${{Redis.REDIS_URL}} do plugin Redis na Railway (não redis://redis:6379 do docker-compose).'
    );
    return;
  }

  if (hostname === 'redis') {
    console.warn(
      '[startup] REDIS_URL hostname é "redis" — parece o padrão do docker-compose, não a URL do plugin Railway. Use REDIS_URL=${{Redis.REDIS_URL}} nas variables do serviço.'
    );
  }
}
