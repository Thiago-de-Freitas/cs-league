# Gamers League — Apresentação para Sócios

**Versão do produto:** 1.1.0  
**Data:** julho de 2026  
**Status:** MVP funcional em desenvolvimento ativo, pronto para deploy em produção

---

## Resumo executivo

**Gamers League** é a plataforma que une **organização de ligas** e **análise de performance** em um único produto — hoje com foco em **Counter-Strike 2**.

Hoje, quem organiza um campeonato amador ou semi-pro vive entre Discord, planilhas e ferramentas manuais. Quem joga usa Leetify ou Scope.gg para evoluir, mas essas métricas ficam fora do histórico da liga. O resultado: operação lenta, dados fragmentados e pouca inteligência competitiva de verdade.

A Gamers League resolve os dois lados do mesmo problema:

- **Para organizadores** — ligas, times, chaveamentos, veto de mapas, resultados e estatísticas oficiais sem planilha.
- **Para jogadores** — cada demo vira rating, radar de skills, forma recente e dicas do que melhorar, vinculadas à competição em que jogaram.

Em uma frase: **cada partida deixa de ser só um placar e vira dado acionável** — para quem administra e para quem disputa.

O produto já está demonstrável de ponta a ponta (cadastro → liga → partida → demo → analytics), com mais de 450 testes automatizados e arquitetura pronta para produção (Railway + Docker).

---

## O problema que resolvemos

### Para organizadores de ligas
- Campeonatos dependem de um kit improvisado: Discord para comunicação, planilhas para chaveamento, Faceit ou registro manual para resultados.
- Inscrições, mata-mata, grupos e publicação de stats consomem tempo e geram inconsistência.
- Demos de CS2 são a fonte mais rica de verdade da partida — e quase nunca entram no fluxo oficial da liga.

### Para jogadores e times
- K/D e ADR existem em vários sites, mas **não conversam com o histórico competitivo da liga**.
- Ferramentas de análise avançada (Leetify, Scope.gg) ajudam o jogador a evoluir, porém **não organizam campeonatos**.
- Falta um lugar onde performance, evolução e contexto da competição apareçam juntos — com orientação clara do que melhorar.

### A oportunidade
O cenário amador e semi-pro de CS2 no Brasil e na América Latina continua expandindo. Organizadores e comunidades precisam de uma solução **em português, integrada e acessível** — competição organizada + inteligência de performance — sem depender só de ecossistemas externos (Faceit, ESEA e similares).

---

## O que é o Gamers League

Uma plataforma web completa para o ciclo competitivo:

1. **Cadastro** com verificação de e-mail
2. **Times** com capitão, membros, convites e logos
3. **Ligas** em formatos variados (mata-mata, grupos + playoffs, 1v1, pickup)
4. **Partidas** com veto de mapas, séries BO1/BO3 e registro de resultados
5. **Upload de demos** (.dem) com processamento automático
6. **Estatísticas** por partida, jogador e liga
7. **Analytics pessoais** — rating, skills, evolução e dicas contextuais

Inclui painel administrativo (moderação e auditoria) e está preparado para nuvem (Railway), com Docker e documentação de infraestrutura.

---

## Público-alvo

| Segmento | Necessidade |
|----------|-------------|
| **Organizadores de ligas amadoras/semi-pro** | Ferramenta única para inscrições, chaveamento, partidas e stats |
| **Times fixos** | Histórico competitivo, perfil de time, convites e posições (AWP, IGL, etc.) |
| **Jogadores individuais** | Ranking, perfil público por Steam ID, analytics de evolução |
| **Comunidades e creators** | Liga própria com branding e dados exportáveis |
| **Admins da plataforma** | Moderação, auditoria e controle de usuários |

---

## Funcionalidades principais

### Gestão competitiva

- **Ligas** com status (próxima, em andamento, concluída, arquivada)
- **Formatos:** mata-mata simples, fase de grupos + playoffs, 1v1
- **Inscrições** com limite de times e abertura/fechamento controlados
- **Chaveamento automático** (semifinais/finais geradas conforme resultados)
- **Fase de grupos** configurável: número de grupos, classificados por grupo, ida e volta, jogos por rodada
- **Séries BO1 e BO3** com pool de mapas e veto integrado
- **Ligas pickup** com balanceamento automático de times (por rating, ADR, HS% ou mix de posições)

### Times e jogadores

- Criação de times com **capitão e membros**
- **Convites** com aceite/recusa
- **Posição preferida** (AWP, Rifler, Entry, Lurker, IGL, Support, Flex)
- **Perfis públicos** por Steam ID e perfis internos de usuário
- **Rankings** agregados por liga e globais

### Demos e estatísticas

- **Upload de demos** vinculado a partidas (incluindo upload em chunks para arquivos grandes)
- **Worker assíncrono** (Python + demoparser2) processa fila via Redis
- Extração automática de: K/D, ADR, HS%, KAST, rating, mapa, stats por lado (CT/T)
- **Destaques (highlights):** multi-kill, ace, clutch, opening kill — com fila para renderização de clipes
- Página de detalhes da partida/demo com estatísticas por jogador

### Analytics de performance (diferencial v1.1)

Inspirado no Leetify, integrado ao perfil do jogador:

| Métrica | Descrição |
|---------|-----------|
| **Rating de performance** | Índice 0–100 consolidado |
| **Mira (Aim)** | Baseado em precisão e impacto no frag |
| **Posicionamento** | Mortes evitáveis, trades, opening deaths |
| **Utilitários** | Dano de HE/molotov, impacto com util |
| **Impact Rating** | Contribuição além do K/D bruto |
| **Forma recente** | Gráficos de evolução nas últimas demos (rating, impacto, skills) |
| **Radar de skills** | Visão comparativa das três dimensões |
| **Insights personalizados** | Dicas contextuais ordenadas por prioridade (o que mais precisa melhorar) |
| **Mapa forte** | Melhor desempenho por mapa e lado |

Os dados avançados são extraídos no worker (trades, opening kills/deaths, dano de utilitários, stats CT/T) e calculados no backend com benchmarks e metas configuráveis.

### Administração e segurança

- Papéis **USER** e **ADMIN**
- Verificação de e-mail
- Banimento temporário de usuários
- **Trilha de auditoria** (ações de usuário, sistema, worker)
- Autenticação JWT

### Experiência visual

- Interface Angular com **design system próprio** (tema escuro, tokens de cor, tipografia gaming)
- Componentes reutilizáveis (cards, formulários, badges, navbar)
- Dashboard, perfis e analytics com visual profissional

---

## Arquitetura técnica

```
┌─────────────────┐     ┌──────────────────┐
│  Frontend       │     │  PostgreSQL      │
│  Angular 19     │────▶│  (Prisma ORM)    │
└────────┬────────┘     └──────────────────┘
         │ HTTP /api
┌────────▼────────┐     ┌──────────────────┐
│  Backend        │────▶│  Redis           │
│  Node.js/Express│     │  (filas)         │
└────────┬────────┘     └────────┬─────────┘
         │                       │
         │              ┌────────▼─────────┐
         │              │  Worker Python   │
         │              │  demoparser2     │
         └──────────────│  analytics, HL   │
                        └──────────────────┘
```

| Camada | Tecnologia |
|--------|------------|
| Frontend | Angular 19, TypeScript, design tokens CSS |
| Backend | Node.js 20, Express, Prisma, TypeScript |
| Worker | Python, demoparser2, filas Redis |
| Banco | PostgreSQL |
| Filas | Redis (demos, highlights) |
| Infra | Docker, Docker Compose, Railway |
| Testes | 237 testes backend, 190+ frontend, 19 worker |

A arquitetura é **modular e escalável**: o worker pode ser replicado independentemente; volumes compartilhados guardam demos, logos, avatares e clipes de highlights.

---

## Estado atual do projeto

| Indicador | Valor |
|-----------|-------|
| Versão | **1.1.0** |
| Commits no repositório | **142** |
| Testes automatizados | **450+** (backend + frontend + worker) |
| Migrations Prisma | Schema completo com ligas, partidas, demos, analytics JSON, highlights, auditoria |
| Deploy | Documentado para Railway (API, front, worker, Postgres, Redis, volumes) |
| Seed de dados | Usuários e ligas de teste para demonstração |

### O que já funciona de ponta a ponta

1. Cadastro → criação de time → criação de liga
2. Inscrição de times → geração de chaveamento/grupos
3. Partida → veto de mapas → resultado
4. Upload de demo → processamento → estatísticas na UI
5. Perfil do jogador → analytics, gráficos e dicas
6. Admin → moderação e auditoria

### Limitações conhecidas (honestidade para o sócio)

- Foco atual em **CS2**; extensão para outros jogos exige novos parsers/workers
- Demos enviadas **antes da v1.1** podem precisar de reprocessamento para analytics completos
- Modelo de negócio (assinatura, taxa por liga, freemium) ainda **não implementado** — produto é MVP técnico
- Highlights com renderização de vídeo dependem de infraestrutura adicional (FFmpeg no worker/volume)

---

## Diferenciais competitivos

1. **Operação + performance no mesmo lugar** — liga, demo, stats oficiais e evolução pessoal sem trocar de ferramenta
2. **Analytics que orientam ação** — não só números: metas, tiers e dicas (“melhore trades”, “HE/round baixo”)
3. **Feito para o mercado local** — português, fluxos de liga amadora brasileira, self-hosted ou cloud
4. **Código próprio e testado** — base sólida para customização, white-label ou features B2B
5. **Arquitetura pronta para crescer** — stack moderna, filas assíncronas, worker escalável de forma independente

---

## Possíveis modelos de negócio (para discussão)

| Modelo | Descrição |
|--------|-----------|
| **SaaS por organizador** | Plano mensal para criar ligas com limite de times/demos |
| **Freemium** | Liga gratuita até X times; analytics avançados no plano pago |
| **White-label** | Plataforma customizada para marcas, universidades ou federações |
| **Marketplace de ligas** | Descoberta de campeonatos abertos + taxa de inscrição |
| **B2B para orgs** | API + dashboard para times semi-profissionais |

Nenhum desses modelos está codificado hoje; o MVP priorizou **produto e tecnologia** antes de monetização.

---

## Roadmap sugerido

### Curto prazo (1–3 meses)
- Deploy estável em produção (Railway ou similar)
- Reprocessar demos antigas para analytics completos
- Onboarding de primeira liga piloto com usuários reais
- Tag de release `v1.1.0` e pipeline CI/CD

### Médio prazo (3–6 meses)
- Notificações (e-mail/push) para convites, partidas e resultados
- Exportação de dados (CSV/PDF) para organizadores
- Melhorias em highlights (clipes automáticos estáveis)
- Página pública de ligas (sem login para espectadores)

### Longo prazo (6–12 meses)
- App mobile ou PWA
- Integração Steam/OpenID para login
- Segundo jogo (Valorant, LoL, etc.) com worker dedicado
- Planos pagos e painel de billing

---

## Por que investir tempo e recursos agora

- **Já é demonstrável** — código, testes, UI e fluxo completo; não é só um pitch
- **Mercado em movimento** — CS2 e ligas amadoras seguem crescendo; quem organizar bem captura comunidade
- **Barreira técnica já vencida** — parser de demos, filas, analytics e interface prontos
- **Várias saídas estratégicas** — B2C, B2B, white-label ou ferramenta interna de uma org

---

## Demonstração rápida (roteiro para reunião)

1. Login como organizador → Dashboard
2. Criar liga em formato mata-mata ou grupos
3. Adicionar times e gerar chaveamento
4. Abrir partida → veto de mapa → registrar placar
5. Enviar demo → aguardar processamento → ver stats da partida
6. Abrir perfil de jogador → mostrar gauges, radar, gráficos de evolução e cards de dica
7. (Opcional) Painel admin e auditoria

**Credenciais de teste (seed):** ver `README.md` na raiz do repositório.

---

## Contato e repositório

- **Projeto:** Gamers League (`cs-league` / `gamers-league`)
- **Stack:** Angular + Node.js + Python + PostgreSQL + Redis
- **Documentação técnica:** `README.md`, `RAILWAY.md`
- **Versão atual:** 1.1.0

---

*Documento de apoio a conversas com sócios e investidores. Atualize a seção "Estado atual" a cada release.*
