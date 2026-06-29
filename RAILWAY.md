# Deploy na Railway — Gamers League

Guia para publicar a plataforma Gamers League na [Railway](https://railway.app) com **API + frontend** no mesmo serviço e **Worker** separado.

## Arquitetura recomendada

### Opção A — Um serviço só (mais simples)

| Serviço | Root Directory | Descrição |
|---------|----------------|-----------|
| **gamers-league-api** | `/` (raiz) | Express + Angular estático (`Dockerfile` na raiz) |

Acesse **só a URL da API** — o frontend é servido pelo mesmo domínio. `CORS_ORIGIN` = URL da API.

### Opção B — Frontend separado (gamers-league-front)

| Serviço | Root Directory | Descrição |
|---------|----------------|-----------|
| **gamers-league-api** | `/` | Só API (mesmo Dockerfile; front embutido mas você usa a URL da API só para `/api`) |
| **gamers-league-front** | `Frontend` | `Frontend/Dockerfile` + `serve.prod.cjs` (estáticos + proxy `/api`) |

**Variables no serviço front (gamers-league-front):**

| Variável | Valor |
|----------|--------|
| `API_URL` | URL pública da API (ex.: `https://gamers-league-back-production.up.railway.app`) — **sem** `/api` no final |
| `PORT` | (Railway define) |
| `NODE_ENV` | `production` (já no Dockerfile) |

**Variables no serviço API (gamers-league-back):**

| Variável | Valor |
|----------|--------|
| `CORS_ORIGIN` | URL do **front** (ex.: `https://gamers-league-front-production.up.railway.app`) — **sem** barra no final |
| `JWT_SECRET` | 32+ caracteres (`openssl rand -hex 32`) |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `DEMO_STORAGE_PATH` | `/data/demos` |
| `TEAM_LOGO_STORAGE_PATH` | `/data/team-logos` |
| `USER_AVATAR_STORAGE_PATH` | `/data/user-avatars` |
| `HIGHLIGHT_CLIPS_PATH` | `/data/highlights` (MP4 dos destaques — **todas as réplicas** do back leem o mesmo volume) |

> **Não** coloque `JWT_SECRET`, `DATABASE_URL` ou `CORS_ORIGIN` no gamers-league-front — o proxy só precisa de `API_URL`.

### Serviços compartilhados

| Serviço | Root Directory | Descrição |
|---------|----------------|-----------|
| **gamers-league-worker** | `Worker` | Python + demoparser2 (`Worker/Dockerfile`) |
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
       └──── Volume /data (demos, logos, avatares, highlights MP4) no gamers-league-back — compartilhado entre réplicas
```

## Variáveis de ambiente (config as code)

A Railway **não** aceita variáveis dentro de `railway.toml` — só build/deploy. As variáveis ficam em arquivos `.env` companion, importados uma vez via CLI ou RAW Editor:

| Serviço | `railway.toml` | Arquivo de variáveis |
|---------|----------------|----------------------|
| gamers-league-back | `/railway.toml` | `railway.back.env` |
| gamers-league-front | `Frontend/railway.toml` | `Frontend/railway.env` |
| gamers-league-worker | `Worker/railway.toml` | `Worker/railway.env` |
| Monolito (Opção A) | `/railway.toml` | `railway.back.monolith.env` |

### Aplicar todas de uma vez

```powershell
# 1. Crie Shared Variable no projeto: JWT_SECRET = (openssl rand -hex 32)
# 2. railway link
.\scripts\railway-import-vars.ps1
```

```bash
railway link
./scripts/railway-import-vars.sh all
```

Ou importe serviço a serviço:

```bash
railway variable import --file railway.back.env --service gamers-league-back --yes
railway variable import --file Frontend/railway.env --service gamers-league-front --yes
railway variable import --file Worker/railway.env --service gamers-league-worker --yes
```

Os arquivos usam referências Railway (`${{Postgres.DATABASE_URL}}`, `${{gamers-league-front.RAILWAY_PUBLIC_DOMAIN}}`, etc.). Ajuste os **nomes dos serviços** se forem diferentes no seu projeto.

---

## Pré-requisitos

- Conta na Railway
- Repositório Git conectado (GitHub/GitLab)
- **Não** commite `.env` com secrets reais — use apenas `.env.example` como referência

## Passo a passo

### 1. Criar projeto

1. **New Project** → **Deploy from GitHub repo** → selecione `gamers-league`
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
| `REDIS_URL` | Sim | `${{Redis.REDIS_URL}}` — referência ao plugin Redis (**não** `redis://redis:6379`) |
| `JWT_SECRET` | Sim | String longa e aleatória (ex.: `openssl rand -hex 32`) |
| `DEMO_STORAGE_PATH` | Sim | `/data/demos` |
| `TEAM_LOGO_STORAGE_PATH` | Sim | `/data/team-logos` |
| `USER_AVATAR_STORAGE_PATH` | Sim | `/data/user-avatars` |
| `HIGHLIGHT_CLIPS_PATH` | Sim | `/data/highlights` — MP4 servidos por qualquer réplica do back (volume compartilhado) |
| `CORS_ORIGIN` | Sim | URL pública da API (ex.: `https://gamers-league-api-production.up.railway.app`) |
| `PORT` | Não | Railway define automaticamente |
| `NODE_ENV` | Não | `production` (já no Dockerfile) |
| `SERVE_FRONTEND` | Não | `true` — opcional; detectado se `/public` existir |

3. **Volume persistente** (só na API — gamers-league-back):
   - Command Palette (`Ctrl+K` / `⌘K`) → **Add Volume**, ou clique direito no serviço no canvas
   - Mount path: `/data`
   - Isso persiste demos (`.dem`), logos de times, fotos de perfil e **clips de destaques** (`.mp4`) entre redeploys
   - Com **várias réplicas** do `gamers-league-back`, todas montam o **mesmo** volume em `/data` — exclusão e streaming de destaques ficam consistentes (Postgres + Redis + arquivos no volume)
   - **A Railway não permite compartilhar o mesmo volume entre dois serviços.** O worker baixa o `.dem` da API via rede privada (`BACKEND_INTERNAL_URL`).

4. **Networking** → **Generate Domain** para obter a URL pública

5. Atualize `CORS_ORIGIN` com a URL gerada e redeploy se necessário

#### Serviço front separado (gamers-league-front) — Opção B

Se você criou um serviço **gamers-league-front** além da API:

1. **Settings → Root Directory** = `Frontend` (**obrigatório**)
2. Confirme que o build usa `Frontend/Dockerfile` (logs **não** devem mencionar Prisma)
3. **Config file**: `Frontend/railway.toml` (sem `preDeployCommand`)
4. **Variables** — só estas:

| Variável | Valor |
|----------|--------|
| `API_URL` | URL base da API (ex.: `https://gamers-league-back-production.up.railway.app`) — **sem** `/api` no final |
| `PORT` | (Railway define) |

5. **Remova** do front: `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL` — o front não usa banco nem Redis
6. No serviço **API (gamers-league-back)**, `CORS_ORIGIN` = URL pública do **front** (não da API)

#### Diagnóstico rápido (front separado)

```text
GET https://gamers-league-front-production.up.railway.app/api/health          → 200 (proxy + API no ar)
GET https://gamers-league-front-production.up.railway.app/api/health/config   → coreErrors: [] (env OK)
POST https://gamers-league-front-production.up.railway.app/api/auth/register  → 201 ou 4xx (nunca 503 se env OK)
```

Se `/api/health` = 200 mas `/api/auth/register` = **503** com `"Serviço em configuração"`, o proxy está correto — falta configurar variáveis no **gamers-league-back**.

> Se o deploy do front falhar com `Environment variable not found: DATABASE_URL` e `prisma/schema.prisma`, o Root Directory **não** está em `Frontend` — o Railway está usando o `railway.toml` da raiz com `npx prisma migrate deploy`.

#### Configurar `REDIS_URL` corretamente (API e Worker)

O hostname `redis` **só existe** na rede do docker-compose local. Na Railway, use a referência ao plugin:

1. No projeto Railway, confirme que existe um serviço **Redis** (Database → Add Redis, se ainda não tiver).
2. Abra o serviço **gamers-league-api** → aba **Variables**.
3. Adicione ou edite:
   - **Name:** `REDIS_URL`
   - **Value:** `${{Redis.REDIS_URL}}` (digite exatamente; o Railway resolve para algo como `redis://default:senha@redis.railway.internal:6379`)
4. Repita no serviço **gamers-league-worker** com o **mesmo** `REDIS_URL=${{Redis.REDIS_URL}}`.
5. **Remova** qualquer valor `redis://redis:6379` — isso causa `getaddrinfo ENOTFOUND redis`.
6. **Redeploy** API e Worker após salvar as variables.

> Dica: ao criar a variable, use **Add Reference** → selecione o serviço Redis → variável `REDIS_URL`.

### 3. Serviço Worker

1. **New Service** → **GitHub Repo** → mesmo repositório
2. **Root Directory**: `Worker`
3. **Config file**: `Worker/railway.toml`
4. **Variables**:

| Variável | Valor |
|----------|-------|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` — **não** `redis://redis:6379` (hostname só existe no docker-compose local) |
| `DEMO_STORAGE_PATH` | `/data/demos` |

5. **Volume**: opcional no worker (cache local em `/data/demos/cache`). Demos vêm da API via `BACKEND_INTERNAL_URL`.
6. **Deploy**: `restartPolicyType = ALWAYS` em `Worker/railway.toml`

> Na Railway cada volume pertence a **um** serviço. Configure `BACKEND_INTERNAL_URL` e `INTERNAL_SERVICE_KEY` (Shared Variable) para o worker buscar arquivos na API.

### 4. Migrar banco e seed (opcional)

As migrations rodam automaticamente no **preDeploy** (`npx prisma migrate deploy` em `railway.toml`), antes do container subir.

Para dados de teste, use o Railway CLI ou um one-off:

```bash
railway run --service gamers-league-api npm run db:seed
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
| `REDIS_URL` | Sim | `${{Redis.REDIS_URL}}` — **não** `redis://redis:6379` |
| `JWT_SECRET` | Sim | 32+ chars (`openssl rand -hex 32`) |
| `CORS_ORIGIN` | Sim | URL pública gerada (ex.: `https://xxx.up.railway.app`) |
| `DEMO_STORAGE_PATH` | Sim | `/data/demos` |
| `TEAM_LOGO_STORAGE_PATH` | Sim | `/data/team-logos` |
| `USER_AVATAR_STORAGE_PATH` | Sim | `/data/user-avatars` |
| `HIGHLIGHT_CLIPS_PATH` | Sim | `/data/highlights` |
| `NODE_ENV` | Não | `production` (já no Dockerfile) |
| `PORT` | Não | Injetado automaticamente pela Railway |

Migrations rodam no **preDeploy** (`npx prisma migrate deploy`), antes do container subir. Se a migration falhar, o deploy para e os logs mostram o erro do Prisma — o healthcheck nem chega a rodar.

Use `/api/health/ready` para diagnosticar Postgres/Redis após o deploy.

## Variáveis de ambiente (resumo)

Copie de `.env.example`. **Nunca** commite valores reais de `JWT_SECRET` ou senhas de banco.

```env
DATABASE_URL=          # Plugin PostgreSQL
REDIS_URL=${{Redis.REDIS_URL}}   # Plugin Redis — NÃO use redis://redis:6379
JWT_SECRET=            # Obrigatório — gere um valor forte
DEMO_STORAGE_PATH=/data/demos
TEAM_LOGO_STORAGE_PATH=/data/team-logos
HIGHLIGHT_CLIPS_PATH=/data/highlights
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
docker build -t gamers-league .
docker run --rm -p 3000:3000 --env-file .env.example gamers-league
```

## Frontend separado (alternativa)

O projeto usa URLs relativas (`/api/...`), ideal para **API servir o front** (padrão).

Se preferir deploy estático separado:

1. Crie um serviço **Static Site** na Railway apontando para `Frontend/`
2. Build command: `npm ci && npm run build`
3. Output directory: `dist/gamers-league/browser`
4. Configure proxy/rewrite de `/api` → URL da API **ou** altere os services Angular para URL absoluta

Para a maioria dos casos, o deploy unificado (raiz `Dockerfile`) é mais simples.

## Armazenamento de demos

- **Railway Volume**: solução atual documentada; monte `/data` na API e no Worker
- **Futuro**: S3/R2/compatível — exigiria alteração em `demoStorage.ts` e no Worker

## Solução de problemas

| Problema | Causa provável | Ação |
|----------|----------------|------|
| **503 em POST `/api/auth/register`** (via front) | Proxy OK; **API** bloqueia por env incompleta (`CORS_ORIGIN`, `JWT_SECRET`, etc.) | No **gamers-league-back**: defina `CORS_ORIGIN` = URL do front e `JWT_SECRET` (32+ chars). Teste `GET .../api/health/config` — deve listar `coreErrors: []` |
| **502** em `/api/*` (via front) | `API_URL` ausente, localhost ou API fora do ar | No **gamers-league-front**: `API_URL=https://SEU-BACK.up.railway.app` (sem `/api`). Redeploy |
| Healthcheck falha (replicas unhealthy) | App não sobe (env inválida) ou migration falhou no preDeploy | Veja **Deploy Logs** — erros `[startup]` listam variáveis faltando; erros Prisma indicam `DATABASE_URL` |
| `/api/health` retorna 503 | Versão antiga checava DB/Redis no health | Redeploy com versão atual: `/api/health` = liveness (200); use `/api/health/ready` para deps |
| `/api/health/ready` retorna 503 | Postgres ou Redis inacessível | Confira `${{Postgres.DATABASE_URL}}` e `${{Redis.REDIS_URL}}` nas variables |
| Demo em "Aguardando" | Worker parado ou volume diferente | Verifique logs do Worker e paths `DEMO_STORAGE_PATH` |
| Jobs em `demo:queue` no Redis mas demos não processam | Worker offline ou Root Directory errado | Root Directory do worker = `Worker`. Deploy Logs devem mostrar `Worker iniciado...` |
| Demo **FALHOU** — arquivo não encontrado no worker | Railway **não compartilha volume** entre serviços | Volume só no **back**. No worker: `BACKEND_INTERNAL_URL` + `INTERNAL_SERVICE_KEY` (Shared Variable) |
| CORS no browser | `CORS_ORIGIN` incorreto | Use a URL pública exata (com `https://`) |
| Build Angular falha (SSL npm) | Node incompatível | Use Node 20 LTS localmente |
| Migration falha | Banco vazio ou URL errada | Confira `DATABASE_URL` e logs do **preDeploy** |
| Connection refused no healthcheck | Processo crashou antes de escutar | Confira Deploy Logs: `JWT_SECRET` (32+ chars), `CORS_ORIGIN`, `DATABASE_URL`. Após o fix, `/api/health` sobe mesmo com config incompleta — use `/api/health/ready` para ver o que falta |
| `REDIS_URL` com `${{Redis.REDIS_URL}}` literal nos logs | Referência não resolvida | No serviço API: Variables → Add Reference → selecione o serviço **Redis** → variável `REDIS_URL` |
| `[ioredis] getaddrinfo ENOTFOUND redis` | `REDIS_URL=redis://redis:6379` (valor do docker-compose) | No serviço API e Worker, defina `REDIS_URL=${{Redis.REDIS_URL}}` apontando ao plugin Redis |
| `[redis] connection failed` nos logs | Plugin Redis ausente ou URL errada | Adicione Redis ao projeto; use `${{Redis.REDIS_URL}}` em ambos os serviços |
| Front: `DATABASE_URL` / `prisma/schema.prisma` no deploy | Root Directory do **gamers-league-front** não é `Frontend` | Settings → Root Directory = `Frontend`; remova `DATABASE_URL` das variables do front; redeploy |
| Front: POST `/api/*` retorna **404** | Proxy quebrado (`http-proxy-middleware` v3) ou `API_URL` inválida | Redeploy do front com `serve.prod.cjs` atualizado; `API_URL` = `https://gamers-league-back-production.up.railway.app` (URL completa, sem `${{...}}` literal nos logs) |
| Front: GET `/api/health` retorna HTML do Angular | Mesmo problema — `/api` não está sendo proxiado | Teste `GET .../api/health` — deve retornar JSON `{"status":"ok"}`, não HTML |

### Logs úteis na Railway

- **`[startup] Variáveis de ambiente ausentes ou inválidas`** — falta `JWT_SECRET`, `CORS_ORIGIN`, `DATABASE_URL` ou `REDIS_URL`
- **`API rodando em http://0.0.0.0:PORT`** — servidor escutando; healthcheck deve passar
- **`[health/ready]`** — falha ao conectar Postgres/Redis (não bloqueia o healthcheck principal)
- **`[startup] REDIS_URL hostname é "redis"`** — variável copiada do docker-compose; troque por `${{Redis.REDIS_URL}}`
- **`[redis] connection failed: ... check REDIS_URL`** — Redis inacessível; API continua no ar, mas upload de demo falha até corrigir a URL

## Arquivos relacionados

- `Dockerfile` — build produção API + frontend
- `railway.toml` + `railway.*.env` — config deploy + variáveis por serviço
- `scripts/railway-import-vars.ps1` — importa variáveis via CLI
- `Worker/Dockerfile` + `Worker/railway.toml` — worker
- `.env.example` — template de variáveis
- `docker-compose.yml` — referência stack local completa
