function isUnresolvedRailwayRef(value: string): boolean {
  return value.includes('${{') || value.includes('{{');
}

/** Erros que impedem login, ligas, etc. (core da API). */
export function getCoreEnvErrors(): string[] {
  if (process.env.NODE_ENV !== 'production') {
    return [];
  }

  const errors: string[] = [];

  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  if (!corsOrigin) {
    errors.push('CORS_ORIGIN deve ser definido (URL do front ou da API, ex.: https://seu-app.up.railway.app)');
  } else if (isUnresolvedRailwayRef(corsOrigin)) {
    errors.push('CORS_ORIGIN não foi resolvida — use a URL pública, não uma referência inválida');
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

  return errors;
}

/** Erros de Redis — bloqueiam fila de demos. */
export function getRedisEnvErrors(): string[] {
  if (process.env.NODE_ENV !== 'production') {
    return [];
  }

  const errors: string[] = [];
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    errors.push(
      'REDIS_URL não configurado — adicione o plugin Redis na Railway e defina REDIS_URL=${{Redis.REDIS_URL}} no cs-league-back e no cs-league-worker'
    );
    return errors;
  }
  if (isUnresolvedRailwayRef(redisUrl)) {
    errors.push('REDIS_URL não foi resolvida — vincule o plugin Redis ou cole a URL copiada do serviço Redis');
    return errors;
  }

  let hostname: string;
  try {
    hostname = new URL(redisUrl).hostname;
  } catch {
    errors.push('REDIS_URL tem formato inválido — use redis://... ou ${{Redis.REDIS_URL}} do plugin Redis');
    return errors;
  }

  if (hostname === 'redis') {
    errors.push(
      'REDIS_URL usa hostname "redis" (docker-compose) — na Railway use REDIS_URL=${{Redis.REDIS_URL}} do plugin Redis'
    );
  } else if (hostname.includes('worker')) {
    errors.push(
      'REDIS_URL aponta para o serviço Worker — use a URL do plugin Redis (${{Redis.REDIS_URL}}), não cs-league-worker.railway.internal'
    );
  }

  return errors;
}

/** Avisos quando Redis não está configurado (upload/reprocess indisponíveis). */
export function getRedisWarnings(): string[] {
  if (process.env.NODE_ENV !== 'production') {
    return [];
  }
  const redisErrors = getRedisEnvErrors();
  if (redisErrors.length === 0) {
    return [];
  }
  return [
    'Upload e reprocessamento de demos indisponíveis — configure REDIS_URL=${{Redis.REDIS_URL}} na API e no Worker.',
  ];
}

/** Diagnóstico sem expor secrets (para debug na Railway). */
export function getEnvConfigStatus() {
  const cors = process.env.CORS_ORIGIN?.trim() ?? '';
  const jwt = process.env.JWT_SECRET ?? '';
  const db = process.env.DATABASE_URL?.trim() ?? '';
  const redis = process.env.REDIS_URL?.trim() ?? '';

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    core: {
      corsOrigin: { set: cors.length > 0, length: cors.length, unresolvedRef: cors ? isUnresolvedRailwayRef(cors) : false },
      jwtSecret: { set: jwt.length > 0, length: jwt.length, minLengthOk: jwt.length >= 32 },
      databaseUrl: { set: db.length > 0, unresolvedRef: db ? isUnresolvedRailwayRef(db) : false },
    },
    redis: {
      set: redis.length > 0,
      unresolvedRef: redis ? isUnresolvedRailwayRef(redis) : false,
      queueAvailable: getRedisEnvErrors().length === 0,
    },
    coreErrors: getCoreEnvErrors(),
    redisErrors: getRedisEnvErrors(),
    warnings: getRedisWarnings(),
  };
}

/** Todos os erros de config (core + redis). */
export function getProductionEnvErrors(): string[] {
  return [...getCoreEnvErrors(), ...getRedisEnvErrors()];
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
