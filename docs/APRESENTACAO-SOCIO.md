# Gamers League — Apresentação para Sócios

**Versão do produto:** 1.1.0  
**Data:** junho de 2026  
**Status:** MVP funcional em desenvolvimento ativo, pronto para deploy em produção

---

## Resumo executivo

**Gamers League** é uma plataforma web para organizar, disputar e analisar competições de esports — com foco inicial em **Counter-Strike 2**. O produto une em um só lugar o que hoje costuma estar fragmentado: gestão de ligas e times, chaveamentos automáticos, upload e processamento de demos, rankings, perfis de jogadores e **analytics de performance** inspirados em ferramentas como Leetify.

A proposta de valor é simples: **transformar cada partida jogada em dado acionável** — para organizadores que querem ligas profissionais sem planilhas, e para jogadores que querem evoluir com métricas claras e dicas personalizadas.

---

## O problema que resolvemos

### Para organizadores de ligas
- Criar e administrar campeonatos exige ferramentas dispersas (Discord, planilhas, Faceit manual, etc.).
- Registrar resultados, gerar mata-mata, controlar inscrições e publicar estatísticas consome tempo e gera erros.
- Demos de CS2 são ricas em dados, mas difíceis de extrair e vincular à competição oficial.

### Para jogadores e times
- Estatísticas básicas (K/D, ADR) existem em vários lugares, mas **não estão integradas ao histórico da liga**.
- Ferramentas de análise avançada (Leetify, Scope.gg) não gerenciam campeonatos.
- Falta visão de evolução ao longo do tempo e orientação prática sobre o que melhorar.

### Oportunidade
O mercado brasileiro e latino de CS2 competitivo amador e semi-profissional cresce continuamente. Há espaço para uma plataforma **localizada, integrada e acessível** que combine competição organizada com inteligência de performance — sem depender exclusivamente de ecossistemas externos (Faceit, ESEA, etc.).

---

## O que é o Gamers League

Plataforma full-stack onde usuários podem:

1. **Cadastrar-se** e verificar e-mail
2. **Criar times** (capitão, membros, convites, logos)
3. **Criar e administrar ligas** com formatos variados
4. **Disputar partidas** com veto de mapas, séries BO1/BO3 e registro de resultados
5. **Enviar demos** (.dem) que são processadas automaticamente
6. **Consultar estatísticas** por partida, jogador e liga
7. **Acompanhar evolução pessoal** com dashboard de performance e dicas contextuais

O produto já possui painel administrativo (gestão de jogadores, trilha de auditoria) e está preparado para deploy em nuvem (Railway), com Docker e documentação de infraestrutura.

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

1. **Tudo em um lugar** — liga + demo + stats + evolução pessoal, sem trocar de plataforma
2. **Analytics acionáveis** — não só números, mas metas, tiers e dicas (“melhore trades”, “HE/round baixo”, etc.)
3. **Feito para o mercado local** — português, fluxos de liga amadora brasileira, self-hosted ou cloud
4. **Código próprio e testado** — base sólida para customização, white-label ou features B2B
5. **Arquitetura moderna** — stack atual, filas assíncronas, pronta para crescer

---

## Possíveis modelos de negócio (para discussão)

| Modelo | Descrição |
|--------|-----------|
| **SaaS por organizador** | Plano mensal para criar ligas com limite de times/demos |
| **Freemium** | Liga gratuita até X times; analytics avançados no plano pago |
| **White-label** | Plataforma customizada para marcas, universidades ou federaciones |
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

- **Produto tangível:** não é slide deck — há código, testes, UI e fluxo completo demonstrável
- **Mercado em crescimento:** CS2 e ligas amadoras seguem em expansão pós-lançamento
- **Barreira técnica superada:** parser de demos, filas, analytics e UI já implementados
- **Flexibilidade estratégica:** pode virar produto B2C, B2B ou ferramenta interna de uma org

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

*Documento gerado para apoio a conversas com sócios e investidores. Atualize a seção "Estado atual" conforme novas releases.*
