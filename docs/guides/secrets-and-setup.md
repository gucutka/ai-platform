# Secrets & Setup — полная инструкция

Где указать секреты, как настроить Slack-бота, GitHub и pipeline — от нуля до первого сообщения и первого Issue.

**См. также:** [getting-started.md](getting-started.md) (краткий путь), [slack-setup.md](slack-setup.md) (Slack пошагово, от и до), [channel-integration.md](channel-integration.md), [project-onboarding.md](project-onboarding.md).

---

## Содержание

1. [Карта всех секретов](#1-карта-всех-секретов)
2. [Файлы, где указывать секреты](#2-файлы-где-указывать-секреты)
3. [Локальная разработка (shell / .env)](#3-локальная-разработка)
4. [Настройка Slack-бота (пошагово)](#4-настройка-slack-бота)
5. [Привязка каналов к агентам](#5-привязка-каналов-к-агентам)
6. [Настройка GitHub (PAT / App)](#6-настройка-github)
7. [GitHub Actions secrets (клиентский репо)](#7-github-actions-secrets)
8. [GitHub Actions secrets (platform repo)](#8-github-actions-secrets-platform)
9. [Секреты в agent YAML (MCP)](#9-секреты-в-agent-yaml)
10. [Конфигурация без секретов](#10-конфигурация-без-секретов)
11. [Чеклист перед первым запуском](#11-чеклист)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Карта всех секретов

| Переменная | Обязательность | Для чего |
|------------|----------------|----------|
| `ANTHROPIC_API_KEY` | **Обязательно** | Claude API — все агенты |
| `CLAUDE_RUNTIME=cloud-agents` | Рекомендуется | Использовать `.agent.yaml` из каталога |
| `SLACK_BOT_TOKEN` | Для Slack | Slack MCP (исходящие) + fallback adapter + SDLC notifications |
| `SLACK_SIGNING_SECRET` | Для Slack Events | Проверка подписи входящих событий |
| `GITHUB_TOKEN` | Для pipeline / issues | GitHub API, создание Issue, PR, labels |
| `GITHUB_REPOSITORY` | Для pipeline | `owner/repo` — какой репозиторий обрабатывать |
| `GH_PAT` | Для CI (monorepo) | Checkout соседнего `ai-platform` из Actions |
| `CHANNEL_WEBHOOK_SECRET` | Опционально | HMAC для generic webhook adapter |
| `CHANNEL_NOTIFY_WEBHOOK_URL` | Опционально | URL для SDLC-уведомлений (не Slack) |
| `CHANNEL_NOTIFY_WEBHOOK_SECRET` | Опционально | HMAC для notify webhook |
| `AI_PLATFORM_WEBHOOK_SECRET` | Опционально | Верификация platform webhook receiver |
| `GITHUB_APP_ID` | Опционально | GitHub App auth (production) |
| `GITHUB_APP_PRIVATE_KEY` | Опционально | GitHub App auth |
| `GITHUB_APP_INSTALLATION_ID` | Опционально | GitHub App auth |
| `PLATFORM_ROOT` | Авто / CI | Путь к `ai-platform/` |
| `PROJECT_DIR` | Авто / CI | Путь к клиентскому проекту |

---

## 2. Файлы, где указывать секреты

### Локально (не коммитить)

| Файл | Что писать |
|------|------------|
| `~/.zshrc` / `~/.bashrc` | `export ANTHROPIC_API_KEY=...` и остальные |
| `ai-platform/runtime/.env` | То же (файл в `.gitignore`) |
| `demo-todo-app/.env` | Только если CLI запускается из client dir |

Пример `.env` — см. `ai-platform/runtime/.env.example`.

### Agent YAML (имя переменной, не значение)

| Файл | Переменная |
|------|------------|
| `cloud-agents/agents/requirements-conversation-agent.agent.yaml` | `SLACK_BOT_TOKEN` |
| `cloud-agents/agents/architecture-conversation-agent.agent.yaml` | `SLACK_BOT_TOKEN` |
| `cloud-agents/agents/project-intake-conversation-agent.agent.yaml` | `SLACK_BOT_TOKEN` |
| `cloud-agents/agents/feature-intake-conversation-agent.agent.yaml` | `SLACK_BOT_TOKEN`, `GITHUB_TOKEN` |

Pipeline-агенты (`triage`, `requirements`, `plan`, …) **не** содержат MCP-секретов — только `contract_toolset`.

### Runtime (читает process.env — править не нужно)

| Файл | Секреты |
|------|---------|
| `runtime/src/mcp-agent-client.ts` | `ANTHROPIC_API_KEY` |
| `runtime/src/claude.ts` | `ANTHROPIC_API_KEY` |
| `runtime/src/agent-definition.ts` | `authorization_token_env` из YAML |
| `runtime/src/channels/orchestrator.ts` | `SLACK_*`, `GITHUB_*`, `CHANNEL_WEBHOOK_SECRET` |
| `runtime/src/channels/adapters/slack/adapter.ts` | `SLACK_BOT_TOKEN` |
| `runtime/src/github.ts` | `GITHUB_TOKEN`, `GITHUB_REPOSITORY` |
| `runtime/src/github-auth.ts` | App / PAT / `GITHUB_TOKEN` |
| `runtime/src/notifications/adapters/slack.ts` | `SLACK_BOT_TOKEN` |
| `runtime/src/notifications/adapters/webhook.ts` | `CHANNEL_NOTIFY_*` |

### GitHub Actions — клиентский репо (demo-todo-app)

| Файл | Secrets в workflow |
|------|-------------------|
| `.github/workflows/ai-platform-pipeline.yml` | `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `GH_PAT` |
| `.github/workflows/issue-routing.yml` | `GITHUB_TOKEN` |
| `.github/workflows/pipeline-resume.yml` | `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, App secrets |
| `.github/workflows/architect-gate-resume.yml` | `GITHUB_TOKEN` |

### GitHub Actions — platform repo

| Файл | Secrets |
|------|---------|
| `.github/workflows/channel-events.yml` | `ANTHROPIC_API_KEY`, `SLACK_*`, `CHANNEL_WEBHOOK_SECRET`, `GITHUB_TOKEN`, `GH_PAT` |
| `.github/workflows/pipeline.yml` | `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` |
| `.github/workflows/agent-dispatch.yml` | `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` |
| `.github/workflows/pipeline-resume.yml` | App + `ANTHROPIC_API_KEY` |
| `.github/workflows/webhook-receiver.yml` | `AI_PLATFORM_WEBHOOK_SECRET` |

### Шаблон для новых клиентов

| Файл |
|------|
| `ai-platform/templates/project-repo/.github/workflows/ai-platform-pipeline.yml` |

---

## 3. Локальная разработка

### 3.1 Минимальный набор (stdio, без Slack)

```bash
cd ai-platform/runtime
cp .env.example .env   # заполнить ANTHROPIC_API_KEY
source .env            # или export вручную

export CLAUDE_RUNTIME=cloud-agents
export PROJECT_DIR=/path/to/demo-todo-app

node dist/cli.js channel-chat \
  --phase discovery \
  --message "B2B todo SaaS" \
  --channel local-test \
  --project-dir "$PROJECT_DIR"
```

### 3.2 Полный набор (Slack + pipeline)

```bash
# ai-platform/runtime/.env
export ANTHROPIC_API_KEY=sk-ant-api03-...
export CLAUDE_RUNTIME=cloud-agents
export SLACK_BOT_TOKEN=xoxb-...
export SLACK_SIGNING_SECRET=...
export GITHUB_TOKEN=ghp_...
export GITHUB_REPOSITORY=your-org/demo-todo-app
export PLATFORM_ROOT=/path/to/ai-platform
export PROJECT_DIR=/path/to/demo-todo-app
```

**Автозагрузка:** CLI читает `runtime/.env` сам при старте (`src/load-env.ts`) —
ручной `source` не требуется. Приоритет: переменные shell > `.env`. Значения с
пробелами (пути) должны быть в кавычках.

---

## 4. Настройка Slack-бота

### Шаг 1 — Создать приложение

1. https://api.slack.com/apps → **Create New App** → **From scratch**
2. Name: `AI Platform Bot`
3. Workspace: ваш тестовый workspace

### Шаг 2 — Bot Token Scopes

**OAuth & Permissions** → **Bot Token Scopes**:

| Scope | Зачем |
|-------|-------|
| `chat:write` | Ответы в канал (MCP + fallback) |
| `channels:history` | Читать историю канала |
| `channels:read` | Информация о канале |
| `groups:history` | Если используете private channels |
| `groups:read` | Private channels |
| `im:history` | DM (опционально) |
| `im:write` | DM (опционально) |

**Install to Workspace** → скопировать **Bot User OAuth Token** → `SLACK_BOT_TOKEN` (`xoxb-...`).

### Шаг 3 — Signing Secret

**Basic Information** → **App Credentials** → **Signing Secret** → `SLACK_SIGNING_SECRET`.

### Шаг 4 — Event Subscriptions (входящие сообщения)

1. **Event Subscriptions** → Enable
2. Request URL: `https://YOUR-PUBLIC-URL/slack/events`
   - Локально: `ngrok http 3000` → `https://abc123.ngrok.io/slack/events`
   - Production: ваш HTTPS endpoint
3. **Subscribe to bot events:**
   - `message.channels` — публичные каналы
   - `message.groups` — private channels (если нужно)
   - `message.im` — DM (если нужно)

### Шаг 5 — Каналы

Создайте каналы и пригласите бота:

| Канал | Фаза | Агент |
|-------|------|-------|
| `#ai-discovery` | discovery | requirements-conversation-agent |
| `#ai-architecture` | architecture | architecture-conversation-agent |
| `#ai-features` | development | feature-intake-conversation-agent |

В каждом канале: `/invite @AI Platform Bot`

Channel ID: клик по названию канала → внизу **Channel ID** (`C0123456789`).

### Шаг 6 — Запуск сервера

```bash
cd ai-platform/runtime
node dist/cli.js slack-events-server \
  --port 3000 \
  --project-dir /path/to/demo-todo-app
```

В другом терминале: `ngrok http 3000`

### Как работает Slack MCP

Агент **сам отправляет ответ** через Slack MCP (`https://mcp.slack.com/mcp`).  
Runtime передаёт в промпт `channel_id` и `thread_ts` из входящего события.  
Секрет: только `SLACK_BOT_TOKEN` в окружении — в YAML указано имя переменной, не значение.

---

## 5. Привязка каналов к агентам

### CLI (рекомендуется)

```bash
# Discovery / BA
node dist/cli.js channel-bind \
  --channel C_DISCOVERY_ID \
  --phase discovery \
  --project-dir /path/to/client

# Architecture
node dist/cli.js channel-bind \
  --channel C_ARCH_ID \
  --phase architecture \
  --project-dir /path/to/client

# Feature intake
node dist/cli.js channel-bind \
  --channel C_DEV_ID \
  --phase development \
  --project-dir /path/to/client
```

### Файл `.ai-platform/channels.yaml` (создаётся автоматически)

```yaml
version: "1.0"
enabled: true
default_provider: slack
bindings:
  - channel_id: "C0123456789"
    phase: discovery
    agent_id: requirements-conversation-agent
  - channel_id: "C9876543210"
    phase: architecture
    agent_id: architecture-conversation-agent
  - channel_id: "C1112223334"
    phase: development
    agent_id: feature-intake-conversation-agent
```

**Секретов здесь нет** — только ID каналов и mapping на агентов.

Проверка:

```bash
node dist/cli.js channel-status --project-dir /path/to/client
```

---

## 6. Настройка GitHub

### Вариант A — Personal Access Token (быстрый старт)

1. GitHub → Settings → Developer settings → **Fine-grained token** или **Classic PAT**
2. Scopes: `repo`, `issues: write`, `pull_requests: write`, `actions: read`
3. `export GITHUB_TOKEN=ghp_...`
4. `export GITHUB_REPOSITORY=your-org/demo-todo-app`

Проверка:

```bash
node dist/cli.js development-status --project-dir /path/to/client
```

### Вариант B — GitHub App (production)

В GitHub → Settings → Developer settings → **GitHub Apps**:

| Secret | Откуда |
|--------|--------|
| `GITHUB_APP_ID` | App settings |
| `GITHUB_APP_PRIVATE_KEY` | Generate private key (PEM) |
| `GITHUB_APP_INSTALLATION_ID` | Install app on org → URL contains installation id |

Runtime fallback order (`github-auth.ts`): App → `GH_PAT` / `GITHUB_PAT` → `GITHUB_TOKEN`.

### Feature intake → Issue

Агент `feature-intake-conversation-agent` использует:
- **Slack MCP** — ответ пользователю
- **GitHub MCP** (`https://mcp.github.com/mcp`) — опционально для чтения
- **platform action** `create_github_issue` — создание Issue (нужны `GITHUB_TOKEN` + `GITHUB_REPOSITORY`)

После создания Issue добавьте label `agent-route:pending` → запускается pipeline.

---

## 7. GitHub Actions secrets

### Клиентский репо (например `demo-todo-app`)

**Settings → Secrets and variables → Actions → New repository secret**

| Secret | Значение | Обязательно |
|--------|----------|-------------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Да |
| `GITHUB_TOKEN` | Авто в Actions (`permissions` в workflow) | Да* |
| `GH_PAT` | PAT с доступом к `ai-platform` repo | Да (monorepo checkout) |

\* В workflow уже `permissions: contents: write, issues: write, pull-requests: write` — встроенный `GITHUB_TOKEN` обычно достаточен. `GH_PAT` нужен для checkout platform из другого репо.

**Repository variable** (не secret):

| Variable | Пример |
|----------|--------|
| `AI_PLATFORM_REPOSITORY` | `your-org/ai-platform` |

Workflow: `demo-todo-app/.github/workflows/ai-platform-pipeline.yml`

### Запуск pipeline вручную

```bash
# Локально
node dist/cli.js run-pipeline --issue 42 --project-dir /path/to/demo-todo-app

# GitHub Actions → AI Platform Pipeline → Run workflow → issue number
```

---

## 8. GitHub Actions secrets (platform)

Если деплоите channel-events на platform repo:

| Secret | Для чего |
|--------|----------|
| `ANTHROPIC_API_KEY` | Агенты |
| `SLACK_BOT_TOKEN` | Slack MCP + notifications |
| `SLACK_SIGNING_SECRET` | Verify events |
| `CHANNEL_WEBHOOK_SECRET` | Generic webhook |
| `GH_PAT` | Checkout client repo |
| `GITHUB_TOKEN` | Issues API |

Workflow: `ai-platform/.github/workflows/channel-events.yml`

---

## 9. Секреты в agent YAML

В `.agent.yaml` указывается **имя env-переменной**, не сам токен:

```yaml
mcp_servers:
  - name: slack
    type: url
    url: https://mcp.slack.com/mcp
    authorization_token_env: SLACK_BOT_TOKEN   # ← имя переменной
  - name: github
    type: url
    url: https://mcp.github.com/mcp
    authorization_token_env: GITHUB_TOKEN
```

Runtime (`agent-definition.ts` → `resolveMcpServers`) читает `process.env[authorization_token_env]` в момент вызова.

**Все 15 агентов** в каталоге:

```bash
node dist/cli.js list-agent-definitions
```

| Агент | MCP секреты |
|-------|-------------|
| requirements-conversation-agent | Slack |
| architecture-conversation-agent | Slack |
| project-intake-conversation-agent | Slack |
| feature-intake-conversation-agent | Slack + GitHub |
| triage, requirements, product-spec, technical-spec, plan, workflow, implement, review, qa, security | Нет (только Claude API) |

---

## 10. Конфигурация без секретов

Эти файлы настраивают поведение, но **не хранят секреты**:

| Файл | Назначение |
|------|------------|
| `.ai-platform/manifest.yaml` | project_id, tier, gates, allowed_paths, purchased_agents |
| `.ai-platform/channels.yaml` | channel_id → phase → agent_id |
| `.ai-platform/knowledge/approvals.yaml` | какие слои knowledge approved |
| `cloud-agents/catalog.yaml` | SKU, packages, пути к agent yaml |
| `cloud-agents/agents/*.agent.yaml` | промпты, MCP **имена** env vars |
| `.ai-platform/project-sync.yaml` | GitHub Projects sync (demo) |

Пример licensing в `manifest.yaml`:

```yaml
# Пусто или отсутствует = все агенты разрешены
purchased_agents:
  - channel-pack
  - full-sdlc
```

---

## 11. Чеклист

### Локальный Slack-бот

- [ ] Node.js 20+ (`node -v`)
- [ ] `npm run build` в `ai-platform/runtime`
- [ ] `ANTHROPIC_API_KEY` в shell / `.env`
- [ ] `CLAUDE_RUNTIME=cloud-agents`
- [ ] Slack App создан, установлен в workspace
- [ ] `SLACK_BOT_TOKEN` и `SLACK_SIGNING_SECRET` экспортированы
- [ ] Бот приглашён в канал
- [ ] `channel-bind` выполнен
- [ ] `slack-events-server` запущен
- [ ] ngrok URL в Slack Event Subscriptions → Verified ✅
- [ ] Тестовое сообщение в канале → ответ бота

### Pipeline (Issue → PR)

- [ ] `.ai-platform/manifest.yaml` в client repo
- [ ] `GITHUB_TOKEN` + `GITHUB_REPOSITORY` локально или в Actions
- [ ] `ANTHROPIC_API_KEY` в GitHub Secrets
- [ ] Workflow `ai-platform-pipeline.yml` в client repo
- [ ] Issue с label `agent-route:pending` или `run-pipeline --issue N`

### Feature intake (Slack → Issue)

- [ ] Business + technical knowledge approved (lifecycle gates)
- [ ] `channel-bind --phase development`
- [ ] `GITHUB_TOKEN` с правами создавать issues
- [ ] Сообщение в `#ai-features` → Issue создан → pipeline

---

## 12. Troubleshooting

| Симптом | Причина | Решение |
|---------|---------|---------|
| `ANTHROPIC_API_KEY is required` | Ключ не экспортирован | `export` или `.env` |
| Slack URL verification failed | Сервер не запущен / неверный URL | `slack-events-server` + ngrok `/slack/events` |
| Бот молчит | Нет token / не в канале / Events не включены | Scopes, invite, `message.channels` |
| MCP Slack error 401 | Неверный token | Переустановить app, новый `xoxb-` |
| Agent отвечает, файлов нет | Не вызван `write_knowledge` | Попросить явно; смотреть логи `Applied:` |
| `GITHUB_TOKEN is required` | Нет token при create_github_issue | Export PAT |
| Pipeline не стартует в CI | Нет secrets / нет label | `agent-route:pending`, `ANTHROPIC_API_KEY` |
| `Agent not licensed` | SKU не куплен | Добавить package в `purchased_agents` или убрать ограничение |
| Node `tracingChannel` error | Node < 20 | Обновить Node до 20+ |

---

## Быстрые команды

```bash
# Список всех агентов
node dist/cli.js list-agent-definitions

# Показать агента и его MCP
node dist/cli.js show-agent --agent feature-intake-conversation-agent

# Статус каналов
node dist/cli.js channel-status --project-dir ./client

# Локальный чат без Slack
node dist/cli.js channel-chat --phase discovery --message "..." --project-dir ./client

# Pipeline
node dist/cli.js run-pipeline --issue 1 --project-dir ./client
```
