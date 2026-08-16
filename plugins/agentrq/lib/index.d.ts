import Schema from "@deepseek-ai/schemastery";
import { Context } from "@deepseek-ai/cordis";
import "@deepseek-ai/dsh-agent";

//#region src/config.d.ts

/** How many of a process's agents may take work from the same workspace. */
type DeliveryScope = 'single-agent' | 'every-agent';
/** Reconnection backoff for a dropped workspace session. */
interface ReconnectConfig {
  /** Delay before the first retry, in milliseconds. */
  initialDelayMs: number;
  /** Ceiling for the exponential backoff, in milliseconds. */
  maxDelayMs: number;
}
/** Resolved plugin configuration. */
interface Config {
  /**
   * The workspace's AgentRQ MCP endpoint. Copy it from Workspace Settings —
   * the URL there already carries `?token=…`, which is how AgentRQ
   * authenticates a headless client. Empty keeps the plugin loaded but idle
   * so a desktop profile can ship the bundle without an endpoint.
   */
  url: string;
  /**
   * Optional bearer token, for deployments that prefer an `Authorization`
   * header over the `?token=` query parameter. Empty means "the URL carries
   * its own credential".
   */
  token: string;
  /**
   * Whether to mount the MCP bridge that gives the model AgentRQ's tools.
   *
   * The plugin mounts one `@deepseek-ai/dsh-mcp-client` instance itself, so a
   * deployment configures the workspace endpoint once. Set false only to mount
   * that bridge as your own row — a second instance on the same `serverName`
   * fails at load.
   */
  mountBridge: boolean;
  /**
   * Namespace the bridged AgentRQ tools are registered under: the model sees
   * `mcp__<serverName>__reply` and friends. The working-agreement section and
   * every framing derive their tool names from this, so the two can never drift.
   */
  serverName: string;
  /**
   * Whether the workspace's pushes — new tasks, the periodic next-task
   * reminder, status checks, and the human's messages — are delivered into the
   * session as they arrive.
   */
  deliverPushes: boolean;
  /**
   * Whether to dequeue one task at startup. The workspace re-pushes an
   * unclaimed task on its own schedule, so this only shortens the wait for
   * work that predates the connection.
   */
  catchUpOnStart: boolean;
  /**
   * One AgentRQ workspace queue serves one worker, and pushes are broadcast to
   * every connected session. Under `single-agent` (the default) exactly one
   * live root agent holds the workspace session, so opening a second chat
   * session does not get every task delivered twice. `every-agent` suits a
   * deployment that wants deliberate fan-out.
   */
  scope: DeliveryScope;
  /** Reconnection backoff for a dropped workspace session. */
  reconnect: ReconnectConfig;
  /**
   * Whether to contribute the AgentRQ working-agreement system-prompt section.
   * Turn it off when a deployment states the same protocol in its own persona.
   */
  guidance: boolean;
  /** Per-request timeout for AgentRQ tool calls, in milliseconds. */
  requestTimeoutMs: number;
}
declare const Config: Schema<Schemastery.ObjectS<{
  url: Schema<string, string>;
  token: Schema<string, string>;
  mountBridge: Schema<boolean, boolean>;
  serverName: Schema<string, string>;
  deliverPushes: Schema<boolean, boolean>;
  catchUpOnStart: Schema<boolean, boolean>;
  scope: Schema<"single-agent" | "every-agent", "single-agent" | "every-agent">;
  reconnect: Schema<Schemastery.ObjectS<{
    initialDelayMs: Schema<number, number>;
    maxDelayMs: Schema<number, number>;
  }>, Schemastery.ObjectT<{
    initialDelayMs: Schema<number, number>;
    maxDelayMs: Schema<number, number>;
  }>>;
  guidance: Schema<boolean, boolean>;
  requestTimeoutMs: Schema<number, number>;
}>, Schemastery.ObjectT<{
  url: Schema<string, string>;
  token: Schema<string, string>;
  mountBridge: Schema<boolean, boolean>;
  serverName: Schema<string, string>;
  deliverPushes: Schema<boolean, boolean>;
  catchUpOnStart: Schema<boolean, boolean>;
  scope: Schema<"single-agent" | "every-agent", "single-agent" | "every-agent">;
  reconnect: Schema<Schemastery.ObjectS<{
    initialDelayMs: Schema<number, number>;
    maxDelayMs: Schema<number, number>;
  }>, Schemastery.ObjectT<{
    initialDelayMs: Schema<number, number>;
    maxDelayMs: Schema<number, number>;
  }>>;
  guidance: Schema<boolean, boolean>;
  requestTimeoutMs: Schema<number, number>;
}>>;
//#endregion
//#region src/client.d.ts
/** One task dequeued from the workspace queue by an explicit `getTask`. */
interface AgentRqTask {
  /** Base62 task id, as AgentRQ reports it. */
  readonly id: string;
  /** Task title, empty when the server omitted the line. */
  readonly title: string;
  /** Task status at fetch time, empty when the server omitted the line. */
  readonly status: string;
  /**
   * The server's own rendering of the task, verbatim. The plugin hands this to
   * the model rather than a reassembled copy, so nothing is lost in parsing.
   */
  readonly text: string;
}
/**
 * One push from the workspace.
 *
 * The channel carries new task assignments, the periodic "next assigned task"
 * reminder, status-check prompts, and messages a human typed into a thread.
 * The plugin does not try to tell them apart: like the gateway, it forwards the
 * content as written and lets the model read it.
 */
interface ChannelMessage {
  /** Task id the push belongs to; also the `chat_id` the `reply` tool wants. */
  readonly chatId: string;
  /** Content as the workspace wrote it. */
  readonly text: string;
  /** Sender label supplied by AgentRQ. */
  readonly user: string;
}
/** Reconnection behavior for the workspace session. */
interface ReconnectOptions {
  /** Delay before the first retry, in milliseconds. */
  readonly initialDelayMs: number;
  /** Ceiling for the exponential backoff, in milliseconds. */
  readonly maxDelayMs: number;
}
/** Options for constructing an {@link AgentRqClient}. */
interface AgentRqClientOptions {
  /** Workspace MCP endpoint, including any `?token=` credential. */
  readonly url: string;
  /** Bearer token, or empty when the URL carries its own credential. */
  readonly token: string;
  /** Timeout for a single tool call, in milliseconds. */
  readonly requestTimeoutMs: number;
  /** Reconnection backoff for a dropped session. */
  readonly reconnect: ReconnectOptions;
  /** Called for every push the workspace delivers. */
  readonly onChannelMessage: (message: ChannelMessage) => void;
  /** Called when a connection attempt fails, for process-local diagnostics. */
  readonly onConnectionError: (error: unknown) => void;
}
/**
 * Interpret a `getTask` reply.
 *
 * @param text - joined text content of the tool result.
 * @returns the task, or undefined when the queue is empty or unparseable.
 */
declare function parseTaskReply(text: string): AgentRqTask | undefined;
/**
 * Interpret a `notifications/claude/channel` payload.
 *
 * `SendChannelNotification` puts the task id in `meta.chat_id` for every push,
 * so the id never has to be recovered from the content.
 */
declare function parseChannelNotification(params: unknown): ChannelMessage | undefined;
/**
 * One supervised AgentRQ workspace session.
 *
 * `start()` opens it and keeps it open: a closed transport or an unrecoverable
 * transport error schedules a reconnect with exponential backoff, because a
 * session that stays down silently stops delivering work.
 */
declare class AgentRqClient {
  private readonly options;
  private client;
  private transport;
  private opening;
  private retryTimer;
  private attempt;
  private closed;
  constructor(options: AgentRqClientOptions);
  /** Whether a session is currently established. */
  get connected(): boolean;
  /**
   * Open the session, and keep reopening it for as long as the client lives.
   *
   * @returns once the first attempt settles; a failure is reported through
   * `onConnectionError` and retried, not thrown.
   */
  start(): Promise<void>;
  /**
   * Open the session if it is not already open.
   *
   * @throws when this attempt fails; a retry is scheduled either way.
   */
  ensureConnected(): Promise<void>;
  /** Dequeue the next task assigned to this agent, if any. */
  fetchNextTask(signal: AbortSignal): Promise<AgentRqTask | undefined>;
  /**
   * Call one AgentRQ tool and return its joined text content.
   *
   * @param name - raw AgentRQ tool name.
   * @param args - JSON arguments for the tool.
   * @param signal - caller cancellation.
   * @returns the joined text blocks of the result.
   * @throws when the connection or the call fails.
   */
  callTool(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<string>;
  /** Close the session and stop reconnecting. */
  dispose(): Promise<void>;
  private open;
  /** Drop the current session and schedule a fresh one. */
  private handleLost;
  private scheduleRetry;
  private createTransport;
  private teardown;
}
//#endregion
//#region src/runtime.d.ts
/** What `agentrq_autopull` reports about the current runtime. */
interface DeliveryStatus {
  /** Whether the workspace session is established right now. */
  readonly connected: boolean;
  /** Whether pushes are configured to reach the session. */
  readonly configured: boolean;
  /** Whether pushes are reaching the session (configured and not paused). */
  readonly active: boolean;
  /** Task id most recently delivered to this agent, or null when none has been. */
  readonly lastDeliveredTaskId: string | null;
}
//#endregion
//#region src/prompt.d.ts
/** The public name the MCP bridge registers for one AgentRQ tool. */
declare function toolName(serverName: string, rawName: string): string;
/**
 * The AgentRQ working agreement.
 *
 * It restates the protocol AgentRQ's MCP server sends as server `Instructions`,
 * because the harness does not surface an MCP server's instructions to the
 * model. Without it the model has the tools but not the collaboration rules,
 * and the human — who is remote and sees only what `reply` sends — goes dark.
 *
 * @param serverName - the bridge namespace the AgentRQ tools are registered under.
 * @returns the section text naming that namespace's tools.
 */
declare function renderGuidanceSection(serverName: string): string;
/** Frame one task the plugin dequeued itself as a user-role turn. */
declare function renderTaskFraming(task: AgentRqTask, serverName: string): string;
/**
 * Frame one workspace push as model-facing context.
 *
 * The same channel carries a new task assignment, the periodic next-task
 * reminder, a status check, and a human's reply. The framing says where the
 * content came from and how to answer it, then hands over the content as
 * written — classifying it here would only add a way to be wrong. The content
 * is JSON-escaped so a crafted message cannot forge a framing field.
 */
declare function renderPushFraming(message: ChannelMessage, serverName: string): string;
//#endregion
//#region src/index.d.ts
/** Cordis function-plugin name used by loader diagnostics. */
declare const name = "agentrq";
/** Services required before this plugin loads. */
declare const inject: string[];
/**
 * Attach AgentRQ to root agents published after this plugin loads.
 *
 * @param ctx - the plugin's context.
 * @param config - validated plugin configuration.
 */
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { AgentRqClient, type AgentRqTask, type ChannelMessage, Config, type DeliveryScope, type DeliveryStatus, type ReconnectConfig, type ReconnectOptions, apply, inject, name, parseChannelNotification, parseTaskReply, renderGuidanceSection, renderPushFraming, renderTaskFraming, toolName };