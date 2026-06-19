# CS League - Plataforma de Análise e Gerenciamento de Ligas CS2

MVP com backend Node.js, worker Python para demos, PostgreSQL, Redis e frontend Angular.

## Pré-requisitos

- **Node.js 20 LTS** (recomendado; Angular 19 não suporta oficialmente Node 24)
- **Docker Desktop** (deve estar **em execução** antes de usar `docker compose`)
- npm

## Opção A — Desenvolvimento local (recomendado)

### 1. Infraestrutura (Postgres + Redis)

Abra o **Docker Desktop**, depois:

```powershell
cd cs-league
docker compose -f docker-compose.dev.yml up -d
```

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

```powershell
cd Worker
pip install -r requirements.txt
# PowerShell — use o mesmo DATABASE_URL e REDIS_URL do Backend/.env
$env:DATABASE_URL="postgresql://csleague:csleague@localhost:5432/csleague"
$env:REDIS_URL="redis://localhost:6379"
python worker.py
```

O backend grava o caminho absoluto do arquivo `.dem` na fila; o worker precisa rodar na **mesma máquina** que a API.

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

## Dados de teste (seed)

```powershell
cd Backend
npm run db:seed
```

| Email | Senha | Papel |
|-------|-------|-------|
| `admin@test.com` | `123456` | Admin |
| `thiago@csleague.com` | `123456` | Dono de ligas |
| `player1@csleague.com` | `123456` | Capitão FURIA Academy |

## Fluxo de teste

1. Cadastre-se em `/register`
2. Crie um time em `/create-team`
3. Crie uma liga em `/create-league`
4. Na liga: adicione times, gere o chaveamento, registre resultados (semifinal/final são criadas automaticamente)
5. Na partida: clique em **Detalhes** → **Enviar Demo**
6. Veja estatísticas na partida ou em `/demo/:id` (K/D, ADR, HS%, KAST)

## Solução de problemas

| Problema | Solução |
|----------|---------|
| `docker_engine` não encontrado | Inicie o **Docker Desktop** |
| `UNABLE_TO_VERIFY_LEAF_SIGNATURE` no npm | Use Node 20 LTS; ou `npm config set strict-ssl false` temporariamente |
| API não conecta ao banco | Verifique se `docker compose -f docker-compose.dev.yml up -d` está rodando |
| Demo fica em "pending" | Inicie o worker Python |

## Estrutura

```
cs-league/
├── Frontend/     Angular 19
├── Backend/      Express + Prisma
├── Worker/       Python + demoparser2
├── docker-compose.yml       # stack completo
└── docker-compose.dev.yml   # só Postgres + Redis
```
