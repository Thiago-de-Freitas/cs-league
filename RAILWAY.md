# Deploy na Railway — CS League

Guia para publicar a plataforma CS League na [Railway](https://railway.app) com **API + frontend** no mesmo serviço e **Worker** separado.

## Arquitetura recomendada

| Serviço | Root Directory | Descrição |
|---------|----------------|-----------|
| **cs-league-api** | `/` (raiz) | Express + Angular estático (`Dockerfile` na raiz) |
| **cs-league-worker** | `Worker` | Python + demoparser2 (`Worker/Dockerfile`) |
| **PostgreSQL** | plugin Railway | Injeta `DATABASE_URL` |
| **Redis** | plugin Railway | Injeta `REDIS_URL` |
| **Volume** | montado nos 2 serviços | Demos e logos de times |

```
┌─────────────┐     ┌─────────────┐
│  API+Front  │────▶│  PostgreSQL │
│  (Node)     │     └─────────────┘
└──────┬──────┘
       │              ┌─────────────┐
       ├─────────────▶│    Redis    │◀──── Worker (Python)
       │              └─────────────┘
       └──── Volume /data/demos + /data/team-logos (compartilhado com Worker)
```

## Pré-requisitos

- Conta na Railway
- Repositório Git conectado (GitHub/GitLab)
- **Não** commite `.env` com secrets reais — use apenas `.env.example` como referência

## Passo a passo

### 1. Criar projeto

1. **New Project** → **Deploy from GitHub repo** → selecione `cs-league`
2. Adicione **PostgreSQL** (Database → Add PostgreSQL)
3. Adicione **Redis** (Database → Add Redis)

### 2. Serviço API (principal)

1. O primeiro serviço criado pelo repo será a API. Confirme:
   - **Root Directory**: vazio ou `/` (raiz)
   - **Config file**: `railway.toml` (detectado automaticamente)
   - **Builder**: Dockerfile (`Dockerfile` na raiz)
2. **Variables** — configure (ou referencie os plugins):

| Variável | Obrigatória | Valor / origem |
|----------|-------------|----------------|
| `DATABASE_URL` | Sim | Referência `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | Sim | Referência `${{Redis.REDIS_URL}}` |
| `JWT_SECRET` | Sim | String longa e aleatória (ex.: `openssl rand -hex 32`) |
| `DEMO_STORAGE_PATH` | Sim | `/data/demos` |
| `TEAM_LOGO_STORAGE_PATH` | Sim | `/data/team-logos` |
| `CORS_ORIGIN` | Sim | URL pública da API (ex.: `https://cs-league-api-production.up.railway.app`) |
| `PORT` | Não | Railway define automaticamente |
| `NODE_ENV` | Não | `production` (já no Dockerfile) |
| `SERVE_FRONTEND` | Não | `true` — opcional; detectado se `/public` existir |

3. **Volume persistente** (Settings → Volumes):
   - Mount path: `/data`
   - API e Worker devem usar o **mesmo volume** para demos e logos

4. **Networking** → **Generate Domain** para obter a URL pública

5. Atualize `CORS_ORIGIN` com a URL gerada e redeploy se necessário

### 3. Serviço Worker

1. **New Service** → **GitHub Repo** → mesmo repositório
2. **Root Directory**: `Worker`
3. **Config file**: `Worker/railway.toml`
4. **Variables**:

| Variável | Valor |
|----------|-------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `DEMO_STORAGE_PATH` | `/data/demos` |

5. **Volume**: monte o **mesmo volume** em `/data` (mesmo nome/volume compartilhado entre serviços)

> Sem volume compartilhado, uploads de demo na API não serão encontrados pelo Worker.

### 4. Migrar banco e seed (opcional)

As migrations rodam automaticamente no **preDeploy** (`npx prisma migrate deploy` em `railway.toml`), antes do container subir.

Para dados de teste, use o Railway CLI ou um one-off:

```bash
railway run --service cs-league-api npm run db:seed
```

(conta com `tsx` disponível — em produção use `npx tsx prisma/seed.ts` a partir do diretório `Backend` ou rode seed localmente apontando para o `DATABASE_URL` de produção)

### 5. Verificar deploy

1. `GET https://SUA-URL/api/health` → `{ "status": "ok" }` (liveness — processo no ar)
2. `GET https://SUA-URL/api/health/ready` → `{ "status": "ok" }` (readiness — Postgres + Redis OK)
3. Abra a URL raiz → frontend Angular
4. Faça login, envie uma demo → status deve sair de **Aguardando** quando o Worker processar

## Checklist de variáveis (healthcheck)

O healthcheck da Railway usa `GET /api/health`, que responde **200** assim que o Node sobe — **sem** depender de banco ou Redis.

Para o deploy passar e a aplicação funcionar, configure **todas** estas variáveis no serviço API:

| Variável | Obrigatória | Como obter |
|----------|-------------|------------|
| `DATABASE_URL` | Sim | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | Sim | `${{Redis.REDIS_URL}}` |
| `JWT_SECRET` | Sim | 32+ chars (`openssl rand -hex 32`) |
| `CORS_ORIGIN` | Sim | URL pública gerada (ex.: `https://xxx.up.railway.app`) |
| `DEMO_STORAGE_PATH` | Sim | `/data/demos` |
| `TEAM_LOGO_STORAGE_PATH` | Sim | `/data/team-logos` |
| `NODE_ENV` | Não | `production` (já no Dockerfile) |
| `PORT` | Não | Injetado automaticamente pela Railway |

Migrations rodam no **preDeploy** (`npx prisma migrate deploy`), antes do container subir. Se a migration falhar, o deploy para e os logs mostram o erro do Prisma — o healthcheck nem chega a rodar.

Use `/api/health/ready` para diagnosticar Postgres/Redis após o deploy.

## Variáveis de ambiente (resumo)

Copie de `.env.example`. **Nunca** commite valores reais de `JWT_SECRET` ou senhas de banco.

```env
DATABASE_URL=          # Plugin PostgreSQL
REDIS_URL=             # Plugin Redis
JWT_SECRET=            # Obrigatório — gere um valor forte
DEMO_STORAGE_PATH=/data/demos
TEAM_LOGO_STORAGE_PATH=/data/team-logos
CORS_ORIGIN=https://seu-dominio.up.railway.app
PORT=                  # Injetado pela Railway
```

Desenvolvimento local: use `.env.local.example`.

## Build local (validação)

```powershell
# Backend
cd Backend
npm install
npm run build

# Frontend
cd ..\Frontend
npm install
npm run build

# Imagem Docker completa (API + front)
cd ..
docker build -t cs-league .
docker run --rm -p 3000:3000 --env-file .env.example cs-league
```

## Frontend separado (alternativa)

O projeto usa URLs relativas (`/api/...`), ideal para **API servir o front** (padrão).

Se preferir deploy estático separado:

1. Crie um serviço **Static Site** na Railway apontando para `Frontend/`
2. Build command: `npm ci && npm run build`
3. Output directory: `dist/cs-league/browser`
4. Configure proxy/rewrite de `/api` → URL da API **ou** altere os services Angular para URL absoluta

Para a maioria dos casos, o deploy unificado (raiz `Dockerfile`) é mais simples.

## Armazenamento de demos

- **Railway Volume**: solução atual documentada; monte `/data` na API e no Worker
- **Futuro**: S3/R2/compatível — exigiria alteração em `demoStorage.ts` e no Worker

## Solução de problemas

| Problema | Causa provável | Ação |
|----------|----------------|------|
| Healthcheck falha (replicas unhealthy) | App não sobe (env inválida) ou migration falhou no preDeploy | Veja **Deploy Logs** — erros `[startup]` listam variáveis faltando; erros Prisma indicam `DATABASE_URL` |
| `/api/health` retorna 503 | Versão antiga checava DB/Redis no health | Redeploy com versão atual: `/api/health` = liveness (200); use `/api/health/ready` para deps |
| `/api/health/ready` retorna 503 | Postgres ou Redis inacessível | Confira `${{Postgres.DATABASE_URL}}` e `${{Redis.REDIS_URL}}` nas variables |
| Demo em "Aguardando" | Worker parado ou volume diferente | Verifique logs do Worker e paths `DEMO_STORAGE_PATH` |
| CORS no browser | `CORS_ORIGIN` incorreto | Use a URL pública exata (com `https://`) |
| Build Angular falha (SSL npm) | Node incompatível | Use Node 20 LTS localmente |
| Migration falha | Banco vazio ou URL errada | Confira `DATABASE_URL` e logs do **preDeploy** |
| Connection refused no healthcheck | Processo crashou antes de escutar | Verifique `JWT_SECRET` (32+ chars) e `CORS_ORIGIN` nos logs |

### Logs úteis na Railway

- **`[startup] Variáveis de ambiente ausentes ou inválidas`** — falta `JWT_SECRET`, `CORS_ORIGIN`, `DATABASE_URL` ou `REDIS_URL`
- **`API rodando em http://0.0.0.0:PORT`** — servidor escutando; healthcheck deve passar
- **`[health/ready]`** — falha ao conectar Postgres/Redis (não bloqueia o healthcheck principal)

## Arquivos relacionados

- `Dockerfile` — build produção API + frontend
- `railway.toml` — config do serviço API
- `Worker/Dockerfile` + `Worker/railway.toml` — worker
- `.env.example` — template de variáveis
- `docker-compose.yml` — referência stack local completa
