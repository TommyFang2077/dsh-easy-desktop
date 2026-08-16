# agentrq

AgentRQ task manager bundled with [DeepSeek Harness Desktop](https://github.com/TommyFang2077/dsh-desktop). Upstream: [agentrq/agentrq](https://github.com/agentrq/agentrq).

The desktop app copies this package into `~/.dsh/profiles/web/node_modules/agentrq` on startup. Without a workspace endpoint the plugin stays idle and does not affect other built-in plugins.

## Enable

Copy the workspace MCP URL from AgentRQ **Settings → Setup → DeepSeek Harness** (it already includes `?token=`), then either:

```sh
export AGENTRQ_WORKSPACE_MCP_URL='https://<workspace>.mcp.agentrq.com/mcp?token=<token>'
```

or pin it in the profile patch, `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- id: agentrq
  name: agentrq
  config:
    url: "https://<workspace>.mcp.agentrq.com/mcp?token=<token>"
```

dsh watches the profile patch, so an edit takes effect without a restart. Prefer the profile patch for interactive use: the environment variable is process-global.

**One profile per workspace.** A second workspace needs its own profile and its own `url`. Mounting this bundle twice in one profile collides on the `agentrq:protocol` section and the `agentrq_autopull` tool.

## What the model gets

Seven AgentRQ tools, bridged by `@deepseek-ai/dsh-mcp-client` under the `agentrq` namespace:

| Tool | Purpose |
|---|---|
| `mcp__agentrq__getTask` | Fetch a task, or dequeue the next one assigned to this agent |
| `mcp__agentrq__createTask` | Assign work to the human or to another agent |
| `mcp__agentrq__updateTaskStatus` | Move a task to `ongoing`, `completed`, `blocked`, … |
| `mcp__agentrq__reply` | Send a message into a task thread — the only thing the remote human sees |
| `mcp__agentrq__getWorkspace` | Read the workspace title and mission |
| `mcp__agentrq__downloadAttachment` | Fetch an attachment's content |
| `mcp__agentrq__publishEvent` | Fire a named event so subscriber workspaces spawn their trigger tasks |

Plus one tool this package owns:

| Tool | Purpose |
|---|---|
| `agentrq_autopull` | `status`, `pause`, `resume`, or `pull_now` for this session's AgentRQ delivery |

The plugin does not poll. AgentRQ pushes work over `notifications/claude/channel`. Repeats of the same `(task, content)` pair are dropped. `agentrq_autopull pause` stops delivery; the session stays open.

## Config

| Key | Default | Meaning |
|---|---|---|
| `url` | `''` (idle) | Workspace MCP endpoint, including its `?token=` credential |
| `token` | `''` | Bearer token, for deployments that prefer an `Authorization` header over `?token=` |
| `mountBridge` | `true` | Mount the `@deepseek-ai/dsh-mcp-client` child that gives the model AgentRQ's tools |
| `serverName` | `agentrq` | Namespace for the bridged tools; the guidance section and framings follow it |
| `deliverPushes` | `true` | Deliver the workspace's tasks and messages into the live session |
| `catchUpOnStart` | `true` | Dequeue one task when the session opens |
| `scope` | `single-agent` | Whether one root agent or every root agent holds a workspace session |
| `reconnect.initialDelayMs` | `1000` | Delay before the first reconnect attempt |
| `reconnect.maxDelayMs` | `900000` | Ceiling for the reconnect backoff |
| `guidance` | `true` | Contribute the AgentRQ working-agreement system-prompt section |
| `requestTimeoutMs` | `30000` | Timeout for one AgentRQ tool call |

A profile patch replaces a row's whole `config` rather than merging into it. Every key except `url` has a schema default.

## Development

```sh
npm install --legacy-peer-deps
npm run typecheck
npm test
npm run build
```

`lib/` is the loadable entry (`package.json` `main`) and is committed so the desktop shell can copy the plugin without a runtime build.

## License

[Apache-2.0](./LICENSE), matching [agentrq/agentrq](https://github.com/agentrq/agentrq).
