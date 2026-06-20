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
  }

  if (errors.length > 0) {
    console.error('[startup] Variáveis de ambiente ausentes ou inválidas:');
    for (const message of errors) {
      console.error(`[startup]   - ${message}`);
    }
    throw new Error(`Configuração inválida (${errors.length} erro(s)). Veja logs acima.`);
  }
}
