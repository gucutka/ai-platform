# Slack — полная настройка от и до

Пошаговый runbook: как поднять работу платформы через Slack — от создания
приложения до живого диалога с каждым агентом и автоматического создания GitHub
Issue.

**См. также:** [secrets-and-setup.md](secrets-and-setup.md) (карта всех секретов),
[channel-integration.md](channel-integration.md) (архитектура слоя каналов),
[ADR-0005](../architecture/ADR-0005-channel-abstraction.md) (почему так устроено).

---

## Содержание

1. [Что получится в итоге](#1-что-получится-в-итоге)
2. [Какие агенты работают через Slack](#2-какие-агенты-работают-через-slack)
3. [Как это работает (поток сообщения)](#3-как-это-работает)
4. [Предусловия](#4-предусловия)
5. [Шаг 1 — Создать Slack App](#шаг-1--создать-slack-app)
6. [Шаг 2 — Scopes (права бота)](#шаг-2--scopes)
7. [Шаг 3 — Установить бота и получить токены](#шаг-3--токены)
8. [Шаг 4 — Локальное окружение (.env)](#шаг-4--окружение)
9. [Шаг 5 — Запустить сервер событий + ngrok](#шаг-5--сервер-событий)
10. [Шаг 6 — Event Subscriptions](#шаг-6--event-subscriptions)
11. [Шаг 7 — Каналы и привязка агентов](#шаг-7--каналы-и-привязка)
12. [Пошагово по каждому агенту](#8-пошагово-по-каждому-агенту)
13. [Фазовые гейты](#9-фазовые-гейты)
14. [Прод: без ноутбука и ngrok](#10-прод)
15. [Troubleshooting](#11-troubleshooting)
16. [Шпаргалка команд](#12-шпаргалка-команд)

---

## 1. Что получится в итоге

Четыре Slack-канала, в каждом — свой агент, ведущий диалог и выполняющий действия:

```
#ai-intake        → project-intake     → рекомендует шаблон, скаффолдит репозиторий
#ai-discovery     → requirements (BA)  → пишет docs/knowledge/business + approve
#ai-architecture  → architect          → пишет technical docs + ADR + approve
#ai-features      → feature-intake      → создаёт GitHub Issue → запускает pipeline
```

Бот отвечает прямо в треде, сам выполняет действия (write_knowledge, write_adr,
create_github_issue) и подтверждает их в чате.

---

## 2. Какие агенты работают через Slack

| Канал (пример) | Фаза (`phase`) | Агент (`agent_id`) | Что делает | Действия (actions) | MCP |
|----------------|----------------|--------------------|------------|--------------------|-----|
| `#ai-intake` | `intake` | `project-intake-conversation-agent` | Уточняет домен/стек/тариф, рекомендует шаблон | `scaffold_project`, `ask_clarification` | Slack |
| `#ai-discovery` | `discovery` | `requirements-conversation-agent` | Бизнес-аналитик: уточняет требования, пишет business-знания | `write_knowledge`, `approve_layer`, `ask_clarification` | Slack |
| `#ai-architecture` | `architecture` | `architecture-conversation-agent` | Архитектор: technical docs + ADR | `write_knowledge`, `write_adr`, `approve_layer`, `ask_clarification` | Slack |
| `#ai-features` | `development` | `feature-intake-conversation-agent` | Превращает запрос в GitHub Issue | `create_github_issue`, `ask_clarification` | Slack + GitHub |

> Маппинг `phase → agent` зашит в `defaultAgentForPhase`
> (`runtime/src/channels/config.ts`). Канал можно привязать к нестандартному агенту
> через `channel-bind --agent`.

Pipeline-агенты (triage, plan, implement, review, …) в Slack **не** разговаривают —
они работают в GitHub после создания Issue.

---

## 3. Как это работает

```
Сообщение в канале
  → Slack Events API  →  POST /slack/events  (slack-events-server)
  → проверка подписи (SLACK_SIGNING_SECRET)
  → url_verification challenge (один раз при настройке)
  → SlackChannelAdapter.parseInbound  (игнорирует bot_message → нет петли)
  → Orchestrator: канал → binding (phase + agent) → ContextPack
  → агент (Cloud Agent / Messages API)
  → ОТВЕТ: агент сам постит в Slack через Slack MCP
           (fallback: chat.postMessage, если MCP не использован)
  → side-effects: write_knowledge / write_adr / create_github_issue
```

Ключевое:
- **Входящие** — нужен публичный HTTPS-эндпоинт (`/slack/events`). Локально — ngrok.
- **Исходящие** — агент пишет в Slack сам через MCP (`https://mcp.slack.com/mcp`).
  Достаточно `SLACK_BOT_TOKEN` в окружении.
- **Подпись**: если `SLACK_SIGNING_SECRET` задан — события без валидной подписи
  отклоняются; если не задан — проверка пропускается (только для локальных тестов).

---

## 4. Предусловия

```bash
node -v                      # 20+ (обязательно)
cd ai-platform/runtime
npm install && npm run build
```

- `ANTHROPIC_API_KEY` — есть.
- `CLAUDE_RUNTIME=cloud-agents`.
- Клиентский проект с `.ai-platform/manifest.yaml` (см. [project-onboarding](project-onboarding.md)).
- Тестовый Slack workspace, где вы админ.

---

## Шаг 1 — Создать Slack App {#шаг-1--создать-slack-app}

1. Откройте https://api.slack.com/apps → **Create New App** → **From scratch**.
2. **App Name:** `AI Platform Bot`.
3. **Workspace:** ваш тестовый workspace → **Create App**.

---

## Шаг 2 — Scopes {#шаг-2--scopes}

**OAuth & Permissions → Scopes → Bot Token Scopes** → добавьте:

| Scope | Зачем |
|-------|-------|
| `chat:write` | Бот пишет ответы (MCP + fallback) |
| `channels:history` | Читать сообщения в публичных каналах |
| `channels:read` | Метаданные канала |
| `groups:history` | Если будете использовать private-каналы |
| `groups:read` | Private-каналы |
| `im:history` | DM (опционально) |
| `im:write` | DM (опционально) |

Минимум для публичных каналов: `chat:write`, `channels:history`, `channels:read`.

---

## Шаг 3 — Токены {#шаг-3--токены}

1. **OAuth & Permissions → Install to Workspace → Allow.**
2. Скопируйте **Bot User OAuth Token** (`xoxb-…`) → это `SLACK_BOT_TOKEN`.
3. **Basic Information → App Credentials → Signing Secret → Show** → это `SLACK_SIGNING_SECRET`.

> Если токен утёк (например, был в переписке) — **Reinstall to Workspace** для нового
> `xoxb-` и **Regenerate** для signing secret.

---

## Шаг 4 — Окружение {#шаг-4--окружение}

`ai-platform/runtime/.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-api03-...
CLAUDE_RUNTIME=cloud-agents

SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...

# нужно только для feature-intake (создание Issue)
GITHUB_TOKEN=ghp_...
GITHUB_REPOSITORY=your-org/demo-todo-app

PROJECT_DIR=/abs/path/to/demo-todo-app
PLATFORM_ROOT=/abs/path/to/ai-platform
```

> **Автозагрузка:** CLI сам читает `runtime/.env` при старте (`src/load-env.ts`) —
> ручной `source` не нужен. Переменные, уже выставленные в shell, имеют приоритет
> над `.env`.

---

## Шаг 5 — Сервер событий {#шаг-5--сервер-событий}

Терминал 1 — сервер:

```bash
cd ai-platform/runtime
node dist/cli.js slack-events-server --port 3000 --project-dir "$PROJECT_DIR"
# Slack events server listening on http://127.0.0.1:3000/slack/events
```

Терминал 2 — публичный туннель:

```bash
ngrok http 3000
# Forwarding  https://abc123.ngrok-free.app -> http://localhost:3000
```

Запомните HTTPS-URL — он понадобится в Шаге 6. Эндпоинт: `…/slack/events`.

---

## Шаг 6 — Event Subscriptions {#шаг-6--event-subscriptions}

1. **Event Subscriptions → Enable Events: On.**
2. **Request URL:** `https://abc123.ngrok-free.app/slack/events`
   - Slack пришлёт `url_verification` → сервер вернёт `challenge` → **Verified ✅**.
   - (Сервер обрабатывает challenge автоматически.)
3. **Subscribe to bot events** → добавьте:
   - `message.channels` — публичные каналы (обязательно)
   - `message.groups` — private-каналы (если нужно)
   - `message.im` — DM (если нужно)
4. **Save Changes.** Если Slack попросит — **Reinstall** приложение.

---

## Шаг 7 — Каналы и привязка {#шаг-7--каналы-и-привязка}

### 7.1 Создать каналы и пригласить бота

В Slack создайте каналы и в каждом выполните:

```
/invite @AI Platform Bot
```

Узнать **Channel ID**: клик по названию канала → внизу окна **Channel ID**
(`C0123456789`).

### 7.2 Привязать каналы к фазам/агентам

```bash
cd ai-platform/runtime

node dist/cli.js channel-bind --channel C_INTAKE_ID  --phase intake       --project-dir "$PROJECT_DIR"
node dist/cli.js channel-bind --channel C_DISC_ID    --phase discovery    --project-dir "$PROJECT_DIR"
node dist/cli.js channel-bind --channel C_ARCH_ID    --phase architecture --project-dir "$PROJECT_DIR"
node dist/cli.js channel-bind --channel C_FEAT_ID    --phase development  --project-dir "$PROJECT_DIR"
```

Это создаёт `$PROJECT_DIR/.ai-platform/channels.yaml`:

```yaml
version: "1.0"
enabled: true
default_provider: slack
bindings:
  - { channel_id: "C_INTAKE_ID", phase: intake,       agent_id: project-intake-conversation-agent }
  - { channel_id: "C_DISC_ID",   phase: discovery,    agent_id: requirements-conversation-agent }
  - { channel_id: "C_ARCH_ID",   phase: architecture, agent_id: architecture-conversation-agent }
  - { channel_id: "C_FEAT_ID",   phase: development,  agent_id: feature-intake-conversation-agent }
```

> Поддерживается префиксный шаблон: `channel_id: "dev*"` поймает любой канал,
> начинающийся на `dev`. Непривязанный канал по умолчанию уходит в фазу `discovery`.

Проверка привязок и сессий:

```bash
node dist/cli.js channel-status --project-dir "$PROJECT_DIR"
node dist/cli.js channel-providers          # slack / webhook / stdio
```

---

## 8. Пошагово по каждому агенту

> Перед тем как пробовать вживую, любой агент можно прогнать **локально без Slack**
> через `channel-chat` (тот же оркестратор, ответ в stdout).

### 8.1 Project intake — `#ai-intake` (фаза `intake`)

**Назначение:** понять, что за проект, и заскаффолдить репозиторий из шаблона.

Локальная проверка:

```bash
node dist/cli.js channel-chat --phase intake \
  --message "Хотим B2B SaaS для управления задачами, стек Node, деплой в AWS, тариф standard" \
  --project-dir "$PROJECT_DIR"
```

В Slack: напишите в `#ai-intake` то же сообщение. Агент уточнит домен/стек/тариф и,
когда данных хватит, выполнит `scaffold_project` (шаблон `express-api` или
`nextjs-minimal`) и подтвердит в треде.

Результат: создан/обновлён клиентский репозиторий из шаблона + onboarding.

---

### 8.2 Requirements / BA — `#ai-discovery` (фаза `discovery`)

**Назначение:** бизнес-аналитик уточняет требования и пишет
`docs/knowledge/business/*.md`, затем апрувит слой.

Локальная проверка:

```bash
node dist/cli.js channel-chat --phase discovery \
  --message "Пользователи — менеджеры команд; нужны проекты, задачи, дедлайны, роли" \
  --project-dir "$PROJECT_DIR"
```

В Slack `#ai-discovery`: опишите домен. Агент задаёт уточняющие вопросы и по мере
стабилизации вызывает `write_knowledge` (layer `business`). В конце, по вашему
подтверждению, — `approve_layer business`. В треде появится
`**Applied:** write_knowledge, approve_layer`.

Проверка результата:

```bash
ls "$PROJECT_DIR/docs/knowledge/business/"
cat "$PROJECT_DIR/.ai-platform/knowledge/approvals.yaml"
```

> **Это разблокирует архитектурную фазу** (см. §9).

---

### 8.3 Architect — `#ai-architecture` (фаза `architecture`)

**Назначение:** архитектор пишет technical-знания (`stack.md`, `modules.md`) и ADR.

**Предусловие:** business-слой должен быть approved (иначе агент ответит блок-сообщением).

Локальная проверка:

```bash
node dist/cli.js channel-chat --phase architecture \
  --message "Postgres, Redis для очередей, REST API, аутентификация через OAuth, деплой в ECS" \
  --project-dir "$PROJECT_DIR"
```

В Slack `#ai-architecture`: обсудите интеграции/масштаб/безопасность. Агент вызывает
`write_knowledge` (layer `technical`) и `write_adr` для значимых решений
(`docs/knowledge/technical/adr/ADR-NNN-*.md`). По готовности — `approve_layer technical`.

Проверка:

```bash
ls "$PROJECT_DIR/docs/knowledge/technical/"
ls "$PROJECT_DIR/docs/knowledge/technical/adr/"
```

---

### 8.4 Feature intake — `#ai-features` (фаза `development`)

**Назначение:** превратить запрос фичи в GitHub Issue с testable acceptance criteria
и запустить pipeline.

**Предусловие:** проект готов к разработке (lifecycle-гейты, см. §9) и заданы
`GITHUB_TOKEN` + `GITHUB_REPOSITORY`.

Локальная проверка:

```bash
node dist/cli.js channel-chat --phase development \
  --message "Нужна страница входа с email+пароль и сбросом пароля" \
  --project-dir "$PROJECT_DIR"
```

В Slack `#ai-features`: опишите фичу. Агент уточняет area/priority/AC, затем
`create_github_issue` (заголовок, user story, acceptance criteria, label
`agent-route:pending`) и сообщает номер Issue в треде.

Дальше pipeline стартует автоматически (label `agent-route:pending`) или вручную:

```bash
node dist/cli.js run-pipeline --issue <N> --project-dir "$PROJECT_DIR"
```

---

## 9. Фазовые гейты

Оркестратор блокирует фазу, пока не выполнены предусловия — чтобы агенты не строили
на неутверждённых данных:

| Фаза | Разблокируется, когда | Что увидите до этого |
|------|------------------------|----------------------|
| `intake` | всегда доступна | — |
| `discovery` | всегда доступна | — |
| `architecture` | **business**-знания approved | бот отвечает блок-сообщением «Architecture phase is not ready» |
| `development` | проект готов к разработке (business + technical, lifecycle) | блок-сообщение «Development phase is not ready» |

Апрув делается агентом BA/архитектором через `approve_layer`, либо вручную в
`$PROJECT_DIR/.ai-platform/knowledge/approvals.yaml`. Статус:

```bash
node dist/cli.js architecture-status --project-dir "$PROJECT_DIR"
node dist/cli.js development-status   --project-dir "$PROJECT_DIR"
```

---

## 10. Прод: без ноутбука и ngrok {#10-прод}

Локальный `slack-events-server` + ngrok — для разработки. Для прод-режима — один из
вариантов:

1. **Хостить сервер событий** (контейнер/VM с публичным HTTPS), `Request URL` →
   `https://your-host/slack/events`. Те же env-переменные.
2. **GitHub Actions Channel Events** — Slack события через прокси →
   `repository_dispatch` (type `channel-event`) → workflow `channel-events.yml`
   (secrets: `ANTHROPIC_API_KEY`, `SLACK_*`, `CHANNEL_WEBHOOK_SECRET`, `GITHUB_TOKEN`,
   `GH_PAT`). См. [secrets-and-setup §8](secrets-and-setup.md#8-github-actions-secrets-platform).
3. **Generic webhook** — любой свой прокси постит нормализованный JSON на
   `channel-receive --provider slack` (см. [channel-integration](channel-integration.md)).

Регистрация cloud-агентов (если используете Claude Cloud Agents):

```bash
node dist/cli.js provision-cloud-agents
node dist/cli.js register-cloud-agent --agent requirements-conversation-agent --cloud-agent-id <id>
```

---

## 11. Troubleshooting

| Симптом | Причина | Решение |
|---------|---------|---------|
| Request URL **not verified** | сервер не запущен / неверный путь | проверьте `slack-events-server`, URL должен кончаться на `/slack/events` |
| `signature verification failed` | неверный `SLACK_SIGNING_SECRET` или часы хоста разошлись | сверьте secret; синхронизируйте время |
| Бот молчит | нет `message.channels` / бот не в канале / нет `chat:write` | добавьте event, `/invite`, scope |
| Отвечает дважды | агент постит через MCP **и** сработал fallback | норма только если MCP не использован; проверьте лог `reply sent via Slack MCP` |
| MCP Slack `401` | протух `SLACK_BOT_TOKEN` | Reinstall app, новый `xoxb-` |
| Петля сообщений (бот отвечает сам себе, сотни токенов) | `chat.postMessage` приходит как `message` **без** `subtype: bot_message`, только с `bot_id` — старый фильтр пропускал эхо | обновите runtime; опционально `SLACK_BOT_USER_ID=U...` из `auth.test`; перезапустите `slack-events-server` |
| `Channel integration disabled` | `enabled: false` в `channels.yaml` | поставьте `enabled: true` |
| Архитектор/feature отвечает блоком | фаза не разблокирована | сначала approve предыдущего слоя (§9) |
| `GITHUB_TOKEN is required` | feature-intake без токена | задайте `GITHUB_TOKEN` + `GITHUB_REPOSITORY` |
| `tracingChannel` error | Node < 20 | обновите Node до 20+ |

---

## 12. Шпаргалка команд

```bash
# Сервер событий
node dist/cli.js slack-events-server --port 3000 --project-dir "$PROJECT_DIR"

# Привязка каналов
node dist/cli.js channel-bind --channel C123 --phase discovery --project-dir "$PROJECT_DIR"
node dist/cli.js channel-status --project-dir "$PROJECT_DIR"
node dist/cli.js channel-providers

# Локальный прогон агента без Slack
node dist/cli.js channel-chat --phase intake|discovery|architecture|development \
  --message "..." --project-dir "$PROJECT_DIR"

# Прогон сырого Slack-payload из файла
node dist/cli.js channel-receive --provider slack --payload-file event.json --project-dir "$PROJECT_DIR"

# Агенты и проверка слоёв
node dist/cli.js list-agent-definitions
node dist/cli.js show-agent --agent feature-intake-conversation-agent
node dist/cli.js validate-agents

# Pipeline после создания Issue
node dist/cli.js run-pipeline --issue <N> --project-dir "$PROJECT_DIR"
```
