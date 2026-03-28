# agent-dispatch

Bridge between Linear and OpenCode. Assign tickets to AI agents, get work done.

## How It Works

```
Linear Issue
    |
    v  (assign to OpenCode agent)
Webhook --> agent-dispatch --> OpenCode
    |                              |
    |                              v
    |                     OpenCode works on issue
    |                              |
    v                              v
Activity Updates <-----------------+
(thoughts, actions, responses)
```

1. You assign an issue to the "OpenCode" agent in Linear
2. Linear fires a webhook to the bridge
3. The bridge creates or continues an OpenCode session with the configured agent (Sisyphus, Prometheus, etc.)
4. OpenCode processes the issue and streams responses
5. The bridge posts activities back to Linear (thoughts, actions, responses)
6. You can reply on the ticket to continue the conversation

## Prerequisites

- **Bun 1.3+** — runtime for the bridge
- **OpenCode** with Oh My OpenCode plugin installed, running `opencode serve`
- **Linear workspace** — admin access needed to create an OAuth app
- **ngrok or public URL** — for receiving webhooks during development

## Quick Start

### Step 1: Clone and Install

```bash
git clone https://github.com/keylbill/agent-dispatch.git
cd agent-dispatch
bun install
```

### Step 2: Create Linear OAuth App

Go to [Linear Settings > API > Applications](https://linear.app/settings/api/applications/new) and create a new application:

| Field | Value |
|-------|-------|
| Name | `OpenCode Bridge` (or any name you prefer) |
| Redirect URI | `http://localhost:3001/oauth/callback` (or your public URL + `/oauth/callback`) |
| Webhook URL | `http://localhost:3001/webhook` (or your public URL + `/webhook`) |
| Scopes | `read`, `write`, `app:assignable`, `app:mentionable` |
| Webhook events | Enable **Agent session events** |

After creating, note:
- **Client ID** — goes in `LINEAR_CLIENT_ID`
- **Client Secret** — goes in `LINEAR_CLIENT_SECRET`
- **Webhook Secret** — goes in `LINEAR_WEBHOOK_SECRET` (shown once when enabling webhooks)

### Step 3: Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Bridge server
PORT=3001
HOST=0.0.0.0

# Linear OAuth (from Step 2)
LINEAR_CLIENT_ID=your_client_id_here
LINEAR_CLIENT_SECRET=your_client_secret_here
LINEAR_WEBHOOK_SECRET=your_webhook_secret_here

# OpenCode server (where opencode serve is running)
OPENCODE_URL=http://localhost:4096
OPENCODE_PASSWORD=            # optional, if you set one

# Default agent
DEFAULT_AGENT=sisyphus

# Session storage
SESSION_STORE=file
SESSION_STORE_PATH=./data/sessions.json
```

### Step 4: Start OpenCode Server

```bash
opencode serve --hostname 0.0.0.0 --port 4096
```

### Step 5: Start the Bridge

```bash
bun run dev
```

### Step 6: Expose via ngrok (Development)

```bash
ngrok http 3001
```

Note the public URL (e.g., `https://abc123.ngrok-free.app`) and:
1. Update your Linear OAuth app's redirect URI to `https://your-ngrok-url/oauth/callback`
2. Update the webhook URL to `https://your-ngrok-url/webhook`
3. Set `PUBLIC_URL=https://your-ngrok-url` in `.env`

### Step 7: Complete OAuth Flow

Visit `http://localhost:3001/oauth/authorize` in your browser. This redirects to Linear for authorization. Approve the app, and you'll see a success message.

The OAuth token is stored in `data/tokens.json` for subsequent requests.

### Step 8: Test

1. Create an issue in Linear
2. Assign it to the OpenCode bot (the app you created appears as an assignable user)
3. Add a label like `agent:sisyphus` or type `/start-work` in a comment
4. Watch the bridge console and Linear issue for activity

## Linear Commands

Type these commands in issue comments to control the agent:

| Command | Description |
|---------|-------------|
| `/agent <name>` | Switch to a specific agent (e.g., `/agent prometheus`) |
| `/start-work` | Start implementation on the issue |
| `/start-work path/to/plan.md` | Start with a specific plan file |
| `/new-session` | Start a fresh OpenCode session for this issue |
| `/abort` | Stop current work and abort the session |

### Labels

Apply these labels to issues to route to specific agents:

| Label | Agent |
|-------|-------|
| `agent:sisyphus` | Sisyphus (Ultraworker) — default |
| `agent:prometheus` | Prometheus (Planner) |
| `agent:oracle` | Oracle (Analysis) |
| `agent:hephaestus` | Hephaestus (Deep Agent) |
| `agent:metis` | Metis (Plan Consultant) |

Priority: label > command > default

## Agent Routing

Agents are loaded dynamically from OpenCode at startup. The bridge queries `OPENCODE_URL/config` to get available agents and creates short-name aliases.

For example, if OpenCode has `Sisyphus (Ultraworker)`:
- Full name: `Sisyphus (Ultraworker)`
- Short name: `sisyphus`
- Alias: `orchestrator` (maps to sisyphus by default)

Check the bridge console logs after startup to see loaded agents.

## Architecture

```
src/
  index.ts              — Hono server entry point, webhook handler
  config.ts             — Environment variable loading and validation
  agents/
    router.ts           — Agent selection logic, command parsing
  linear/
    oauth.ts            — OAuth flow, token storage
    webhook.ts          — Signature verification, payload parsing
    activities.ts       — Linear SDK client for posting activities
    types.ts            — TypeScript interfaces for Linear payloads
  opencode/
    client.ts           — OpenCode SDK client wrapper
    output-parser.ts    — Convert OpenCode response to Linear activities
  store/
    session-store.ts    — Persist Linear↔OpenCode session mappings
```

### Request Flow

1. **Webhook received** (`src/index.ts`) — verifies signature, parses payload
2. **Session lookup** (`src/store/session-store.ts`) — checks for existing OpenCode session
3. **Agent routing** (`src/agents/router.ts`) — determines agent from labels, commands, or defaults
4. **OpenCode prompt** (`src/opencode/client.ts`) — sends issue content to OpenCode session
5. **Response parsing** (`src/opencode/output-parser.ts`) — converts OpenCode output to Linear activities
6. **Activity posting** (`src/linear/activities.ts`) — posts thoughts, actions, responses back to Linear

## Deployment

### Docker

```bash
docker-compose up -d
```

The compose file runs both the bridge and OpenCode server together. Set `ANTHROPIC_API_KEY` and `OPENCODE_PASSWORD` in your environment.

### Google Cloud Run

Use the deploy script:

```bash
GCP_PROJECT_ID=my-project OPENCODE_URL=https://my-opencode.example.com ./scripts/deploy.sh
```

Requires:
- Artifact Registry repository created
- Secrets in Secret Manager:
  - `agent-dispatch-linear-client-id`
  - `agent-dispatch-linear-client-secret`
  - `agent-dispatch-linear-webhook-secret`
  - `agent-dispatch-opencode-password`

### Important: OpenCode Must Be Persistent

Cloud Run is stateless and scales to zero. OpenCode needs a persistent environment (workspace, session state). For production, run OpenCode on:
- GCE (Compute Engine) — persistent VM
- Cloud SQL + Cloud Run — if you configure OpenCode to use external storage
- A dedicated server — VPS, bare metal, etc.

The bridge itself can run anywhere. It only needs to reach the OpenCode server URL.

## Multi-App Mode

Register separate Linear OAuth apps so each agent appears as its own assignable user (e.g. `@Prometheus`, `@Sisyphus`).

1. Create one OAuth app per agent in [Linear Settings > API > Applications](https://linear.app/settings/api/applications/new)
2. All apps use the same redirect URI and webhook URL (the bridge handles routing)
3. Enable **Agent session events** on each app
4. Configure `AGENT_APPS` in `.env` with a JSON mapping:

```bash
AGENT_APPS={"<prometheus_client_id>":{"clientId":"<prometheus_client_id>","clientSecret":"<secret>","webhookSecret":"<wh_secret>","defaultAgent":"prometheus"},"<sisyphus_client_id>":{"clientId":"<sisyphus_client_id>","clientSecret":"<secret>","webhookSecret":"<wh_secret>","defaultAgent":"sisyphus"}}
```

5. Authorize each app: visit `/oauth/authorize/prometheus` and `/oauth/authorize/sisyphus`

The `/start-work` command automatically hands off to the executor agent (Atlas by default) and returns to the previous agent when done. Atlas is never exposed as an assignable user.

## Configuration Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LINEAR_CLIENT_ID` | Yes | — | Fallback OAuth client ID (single-app mode) |
| `LINEAR_CLIENT_SECRET` | Yes | — | Fallback OAuth client secret |
| `LINEAR_WEBHOOK_SECRET` | Yes | — | Fallback webhook secret for signature verification |
| `OPENCODE_URL` | Yes | — | URL of the OpenCode server |
| `OPENCODE_PASSWORD` | No | — | Password for OpenCode server authentication |
| `PORT` | No | `3001` | Port the bridge listens on |
| `HOST` | No | `0.0.0.0` | Host to bind |
| `PUBLIC_URL` | No | `http://localhost:PORT` | Public URL for OAuth callbacks |
| `DEFAULT_AGENT` | No | `Sisyphus (Ultraworker)` | Agent when no app/label/command specifies one |
| `EXECUTOR_AGENT` | No | `Atlas (Plan Executor)` | Hidden agent for `/start-work` execution |
| `AGENT_APPS` | No | `{}` | JSON mapping of OAuth client IDs to app configs |
| `SESSION_STORE_PATH` | No | `./data/sessions.json` | Path to session mapping file |

## Development

```bash
# Run with hot reload
bun run dev

# Type check
bun run typecheck

# Lint and format
bun run check
bun run check:fix
```