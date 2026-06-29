# Gamers League — Plataforma de Ligas e Competições

MVP com backend Node.js, worker Python para demos, PostgreSQL, Redis e frontend Angular. Suporte inicial a Counter-Strike 2, com arquitetura preparada para outros jogos.

## Pré-requisitos

- **Node.js 20 LTS** (recomendado; Angular 19 não suporta oficialmente Node 24)
- **Docker Desktop** (deve estar **em execução** antes de usar `docker compose`)
- npm

## Opção A — Desenvolvimento local (recomendado)

### 1. Infraestrutura (Postgres + Redis)

Abra o **Docker Desktop**, depois:

```powershell
cd gamers-league
docker compose -f docker-compose.dev.yml up -d
```

> Se você clonou o repositório com o nome antigo (`cs-league`), use essa pasta ou renomeie localmente.

### 2. Backend

```powershell
cd Backend
copy ..\.env.local.example .env
npm install
npx prisma migrate deploy
npm run dev
```

API em http://localhost:3000

### 3. Worker (necessário para processar demos)

As demos ficam em **Aguardando** até o worker consumir a fila Redis. Rode em um terminal separado:

**Opção rápida (a partir do Backend):**

```powershell
cd Backend
npm run worker:dev
```

**Ou manualmente:**

```powershell
cd Worker
pip install -r requirements.txt
# PowerShell — use o mesmo DATABASE_URL e REDIS_URL do Backend/.env
$env:DATABASE_URL="postgresql://gamersleague:gamersleague@localhost:5432/gamersleague"
$env:REDIS_URL="redis://localhost:6379"
python worker.py
```

**Worker no Docker (dev):** compartilha `./Backend/data/demos` com o host. Defina `DEMO_STORAGE_PATH=./data/demos` (relativo) ou o caminho absoluto equivalente no `Backend/.env` para a API gravar no mesmo volume:

```powershell
docker compose -f docker-compose.dev.yml --profile worker up -d worker
```

O backend grava o caminho absoluto do arquivo `.dem` na fila quando `DEMO_STORAGE_PATH` não está definido; para API + worker Docker, use `DEMO_STORAGE_PATH` consistente (ex.: `./data/demos` no Backend e volume montado em `/data/demos` no worker).

### 4. Frontend

```powershell
cd Frontend
npm install
npm start
```

Acesse http://localhost:4200

## Opção B — Stack completo no Docker

```powershell
# Docker Desktop deve estar rodando
copy .env.example .env
docker compose up --build
```

Em outro terminal: `cd Frontend && npm start`

## Deploy na Railway

Veja **[RAILWAY.md](./RAILWAY.md)** para deploy em produção (API + frontend + worker + Postgres + Redis).

## Dados de teste (seed)

```powershell
cd Backend
npm run db:seed
```

| Email | Senha | Papel |
|-------|-------|-------|
| `admin@test.com` | `123456` | Admin |
| `thiago@gamersleague.com` | `123456` | Dono de ligas |
| `player1@gamersleague.com` | `123456` | Capitão FURIA Academy |

## Fluxo de teste

1. Cadastre-se em `/register`
2. Crie um time em `/create-team`
3. Crie uma liga em `/create-league`
4. Na liga: adicione times, gere o chaveamento, registre resultados (semifinal/final são criadas automaticamente)
5. Na partida: clique em **Detalhes** → **Enviar Demo**
6. Veja estatísticas na partida ou em `/demo/:id` (K/D, ADR, HS%, KAST)
7. No dashboard (logado), clique em um jogador no ranking — ou acesse `/player/:steamId` diretamente (perfil público, sem login)

## Solução de problemas

| Problema | Solução |
|----------|---------|
| `docker_engine` não encontrado | Inicie o **Docker Desktop** |
| `UNABLE_TO_VERIFY_LEAF_SIGNATURE` no npm | Use Node 20 LTS; ou `npm config set strict-ssl false` temporariamente |
| API não conecta ao banco | Verifique se `docker compose -f docker-compose.dev.yml up -d` está rodando |
| Demo fica em "pending" | Inicie o worker Python |
| Postgres com credenciais antigas (`csleague`) | `docker compose -f docker-compose.dev.yml down -v` e suba de novo |

## Estrutura

```
gamers-league/
├── Frontend/     Angular 19
├── Backend/      Express + Prisma
├── Worker/       Python + demoparser2
├── docker-compose.yml       # stack completo
└── docker-compose.dev.yml   # só Postgres + Redis
```
