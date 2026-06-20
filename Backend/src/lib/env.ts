/** Valida variáveis obrigatórias em produção; registra erros em stderr para logs da Railway. */
export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const errors: string[] = [];

  if (!process.env.CORS_ORIGIN?.trim()) {
    errors.push('CORS_ORIGIN deve ser definido (URL pública da API, ex.: https://seu-app.up.railway.app)');
  }

  const jwt = process.env.JWT_SECRET;
  if (!jwt || jwt === 'dev-secret' || jwt.length < 32) {
    errors.push('JWT_SECRET deve ter pelo menos 32 caracteres aleatórios (ex.: openssl rand -hex 32)');
  }

  if (!process.env.DATABASE_URL?.trim()) {
    errors.push('DATABASE_URL deve ser definido (referência ${{Postgres.DATABASE_URL}})');
  }

  if (!process.env.REDIS_URL?.trim()) {
    errors.push('REDIS_URL deve ser definido (referência ${{Redis.REDIS_URL}})');
  } else {
    logRedisUrlWarnings(process.env.REDIS_URL.trim());
  }

  if (errors.length > 0) {
    console.error('[startup] Variáveis de ambiente ausentes ou inválidas:');
    for (const message of errors) {
      console.error(`[startup]   - ${message}`);
    }
    throw new Error(`Configuração inválida (${errors.length} erro(s)). Veja logs acima.`);
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
