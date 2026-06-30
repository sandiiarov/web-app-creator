[Skip to main content](https://mastra.ai/reference/agents/agent#__docusaurus_skipToContent_fallback)

Copy markdown

On this page

The `Agent` class is the foundation for creating AI agents in Mastra. It provides methods for generating responses, streaming interactions, and handling voice capabilities.

## Usage examples [Direct link to Usage examples](https://mastra.ai/reference/agents/agent\#usage-examples "Direct link to Usage examples")

### Basic string instructions [Direct link to Basic string instructions](https://mastra.ai/reference/agents/agent\#basic-string-instructions "Direct link to Basic string instructions")

Passing instructions as a string or array of strings is the simplest way to set up an agent. This is useful for straightforward use cases where you need to provide a prompt without additional configuration.

src/mastra/agents/string-agent.ts

```typescript
import { Agent } from '@mastra/core/agent'

// String instructions
export const agent = new Agent({
  id: 'test-agent',
  name: 'Test Agent',
  instructions: 'You are a helpful assistant that provides concise answers.',
  model: 'openai/gpt-5.5',
})

// System message object
export const agent2 = new Agent({
  id: 'test-agent-2',
  name: 'Test Agent 2',
  instructions: {
    role: 'system',
    content: 'You are an expert programmer',
  },
  model: 'openai/gpt-5.5',
})

// Array of system messages
export const agent3 = new Agent({
  id: 'test-agent-3',
  name: 'Test Agent 3',
  instructions: [\
    { role: 'system', content: 'You are a helpful assistant' },\
    { role: 'system', content: 'You have expertise in TypeScript' },\
  ],
  model: 'openai/gpt-5.5',
})
```

### Provider-specific configurations [Direct link to Provider-specific configurations](https://mastra.ai/reference/agents/agent\#provider-specific-configurations "Direct link to Provider-specific configurations")

Each model provider also enables a few different options, including prompt caching and configuring reasoning. You can set `providerOptions` on the instruction level to set different caching strategy per system instruction/prompt.

src/mastra/agents/core-message-agent.ts

```typescript
import { Agent } from '@mastra/core/agent'

export const agent = new Agent({
  id: 'core-message-agent',
  name: 'Core Message Agent',
  instructions: {
    role: 'system',
    content: 'You are a helpful assistant specialized in technical documentation.',
    providerOptions: {
      openai: {
        reasoningEffort: 'low',
      },
    },
  },
  model: 'openai/gpt-5.5',
})
```

### Mixed instruction formats [Direct link to Mixed instruction formats](https://mastra.ai/reference/agents/agent\#mixed-instruction-formats "Direct link to Mixed instruction formats")

src/mastra/agents/multi-message-agent.ts

```typescript
import { Agent } from '@mastra/core/agent'

// This could be customizable based on the user
const preferredTone = {
  role: 'system',
  content: 'Always maintain a professional and empathetic tone.',
}

export const agent = new Agent({
  id: 'multi-message-agent',
  name: 'Multi Message Agent',
  instructions: [\
    { role: 'system', content: 'You are a customer service representative.' },\
    preferredTone,\
    {\
      role: 'system',\
      content: 'Escalate complex issues to human agents when needed.',\
      providerOptions: {\
        anthropic: { cacheControl: { type: 'ephemeral' } },\
      },\
    },\
  ],
  model: 'anthropic/claude-sonnet-4-6',
})
```

## Thread signals [Direct link to Thread signals](https://mastra.ai/reference/agents/agent\#thread-signals "Direct link to Thread signals")

Use Agent signals to send real-time input and context into a memory thread. Message APIs are for user-authored input. `sendSignal()` is the lower-level API for system-generated context.

When the target thread is running, `sendMessage()` delivers the message into the active agent loop. When the thread is idle, Mastra starts a stream with the message as the first input by default.

src/mastra/signals.ts

```typescript
const subscription = await agent.subscribeToThread({
  resourceId: 'user-123',
  threadId: 'thread-abc',
})

void (async () => {
  for await (const chunk of subscription.stream) {
    console.log(chunk)
  }
})()

agent.sendMessage('Use the latest customer note too.', {
  resourceId: 'user-123',
  threadId: 'thread-abc',
  ifIdle: {
    streamOptions: {
      maxSteps: 3,
    },
  },
})
```

Use `attributes` to identify different users in a shared thread. The attributes are rendered as XML so the model can distinguish who said what:

```typescript
agent.sendMessage(
  {
    contents: 'Can we simplify the API surface?',
    attributes: { name: 'Devin', from: 'slack' },
  },
  { resourceId: 'user-123', threadId: 'thread-abc' },
)
```

The model receives this as:

```xml
<user name="Devin" from="slack">Can we simplify the API surface?</user>
```

Use `ifActive.attributes` and `ifIdle.attributes` when the message should carry different context depending on whether the thread is currently running:

src/mastra/signals.ts

```typescript
agent.sendMessage(
  {
    contents: 'Also cover the edge cases.',
    attributes: { source: 'chat' },
  },
  {
    resourceId: 'user-123',
    threadId: 'thread-abc',
    ifActive: { attributes: { delivery: 'while-active' } },
    ifIdle: { attributes: { delivery: 'new-message' } },
  },
)
```

When the thread is active, the model sees:

```xml
<user source="chat" delivery="while-active">Also cover the edge cases.</user>
```

When the thread is idle, the model sees:

```xml
<user source="chat" delivery="new-message">Also cover the edge cases.</user>
```

The UI sees the message contents and can also read `attributes` and `metadata` off the signal message for custom rendering (e.g. showing user names, avatars, or platform badges).

### `sendMessage(message, options)` [Direct link to sendmessagemessage-options](https://mastra.ai/reference/agents/agent\#sendmessagemessage-options "Direct link to sendmessagemessage-options")

Sends a user message to an active run or memory thread. Use this when the active agent should receive the message immediately.

### message:

string \| Array<TextPart \| FilePart> \| { contents: string \| Array<TextPart \| FilePart>; attributes?: Record<string, JSONValue>; metadata?: Record<string, unknown>; providerOptions?: ProviderMetadata }

User-authored input. Bare strings and parts without attributes are sent to the model as normal user input. When \`attributes\` are present, Mastra renders the message as a \`<user>\` XML element with the attributes included.

### options?:

object

Targeting and delivery behavior for the message.

object

### runId?:

string

Run ID to target directly. Use this when you already know the active run ID.

### resourceId?:

string

Resource ID for the memory thread. Required with \`threadId\` for thread-targeted messages.

### threadId?:

string

Thread ID to target. Required with \`resourceId\` for thread-targeted messages.

### ifActive?:

object

Controls what happens when the target thread is active.

object

### behavior?:

'deliver' \| 'persist' \| 'discard'

Controls what happens when the target thread is active. Defaults to \`deliver\`.

### attributes?:

Record<string, string \| number \| boolean>

Attributes merged into the message when Mastra accepts it while the target thread is active.

### ifIdle?:

object

Controls what happens when the target thread is idle.

object

### behavior?:

'wake' \| 'persist' \| 'discard'

Controls what happens when the target thread is idle. Defaults to \`wake\`.

### streamOptions?:

AgentExecutionOptions

Options for the stream that starts when \`ifIdle.behavior\` is \`wake\`. Mastra uses the top-level \`resourceId\` and \`threadId\` for memory context.

### attributes?:

Record<string, string \| number \| boolean>

Attributes merged into the message when Mastra accepts it while the target thread is idle.

Set `ifIdle.behavior` to `wake` and pass `ifIdle.streamOptions` when an idle thread should start a new stream with custom execution options:

src/mastra/signals.ts

```typescript
agent.sendMessage('Continue with the next step.', {
  resourceId: 'user-123',
  threadId: 'thread-abc',
  ifIdle: {
    behavior: 'wake',
    streamOptions: {
      maxSteps: 3,
    },
  },
})
```

Returns `{ accepted: Promise<SendAgentSignalAccepted>, signal: CreatedAgentSignal, persisted?: Promise<void> }`. `accepted` resolves at decision-time, once Mastra decides what to do with the message: `{ action: 'wake', runId, output }` when this process runs the agent (it started or won the lease to start the run), `{ action: 'deliver', runId }` when the message is forwarded onto an existing run (including when this process loses a cross-process wake race), or `{ action: 'persist' }` / `{ action: 'discard' }` when nothing ran. `runId` is the authoritative id of the run that handled the message and is present only on `wake` and `deliver`; for `persist`/`discard` use `result.signal.id` to correlate the stored message. `accepted` resolves for routing — a generation error on a `wake` run surfaces through `output.consumeStream()` — and rejects only when the message could not be routed or started at all (e.g. a misconfigured agent). `persisted` is only present for `persist` behavior and resolves when Mastra finishes writing the message to memory. On the `wake` action, `output` is the agent stream for in-process consumption.

### `queueMessage(message, options)` [Direct link to queuemessagemessage-options](https://mastra.ai/reference/agents/agent\#queuemessagemessage-options "Direct link to queuemessagemessage-options")

Queues a user message for the next turn on a thread. If the thread is active, Mastra waits for the active run to finish, then starts a new run with the queued message. If the thread is idle, Mastra starts a run immediately.

```typescript
agent.queueMessage('Also check whether the tests need updates.', {
  resourceId: 'user-123',
  threadId: 'thread-abc',
})
```

`queueMessage()` accepts the same `message` and `options` shape as `sendMessage()` and returns `{ accepted: Promise<SendAgentSignalAccepted>, signal: CreatedAgentSignal, persisted?: Promise<void> }`, with the same `accepted` semantics as `sendMessage()`.

### `sendSignal(signal, options)` [Direct link to sendsignalsignal-options](https://mastra.ai/reference/agents/agent\#sendsignalsignal-options "Direct link to sendsignalsignal-options")

Sends a signal to an active run or memory thread.

### signal:

{ type: 'user' \| 'state' \| 'reactive' \| 'notification' \| 'user-message' \| 'system-reminder'; tagName?: string; contents: string \| Array<TextPart \| FilePart>; attributes?: Record<string, JSONValue>; metadata?: Record<string, unknown>; providerOptions?: ProviderMetadata }

Signal context to send to the thread. \`type\` is the semantic signal category. \`tagName\` controls the XML tag the model sees. For example, \`{ type: 'notification', tagName: 'github-review' }\` renders as \`<github-review>...</github-review>\`. Legacy \`user-message\` and \`system-reminder\` payloads are still accepted and normalized. Unknown \`type\` values are rejected; use \`tagName\` for custom XML tags.

### options?:

object

Targeting and delivery behavior for the signal.

object

### runId?:

string

Run ID to target directly. Use this when you already know the active run ID.

### resourceId?:

string

Resource ID for the memory thread. Required with \`threadId\` for thread-targeted signals.

### threadId?:

string

Thread ID to target. Required with \`resourceId\` for thread-targeted signals.

### ifActive?:

object

Controls what happens when the target thread is active.

object

### behavior?:

'deliver' \| 'persist' \| 'discard'

Controls what happens when the target thread is active. Defaults to \`deliver\`.

### attributes?:

Record<string, string \| number \| boolean>

Attributes merged into the signal when Mastra accepts it while the target thread is active.

### ifIdle?:

object

Controls what happens when the target thread is idle.

object

### behavior?:

'wake' \| 'persist' \| 'discard'

Controls what happens when the target thread is idle. Defaults to \`wake\`.

### streamOptions?:

AgentExecutionOptions

Options for the stream that starts when \`ifIdle.behavior\` is \`wake\`. Mastra uses the top-level \`resourceId\` and \`threadId\` for memory context.

### attributes?:

Record<string, string \| number \| boolean>

Attributes merged into the signal when Mastra accepts it while the target thread is idle.

Returns `{ accepted: Promise<SendAgentSignalAccepted>, signal: CreatedAgentSignal, persisted?: Promise<void> }`. `accepted` resolves at decision-time, once Mastra decides what to do with the signal: `{ action: 'wake', runId, output }` when this process runs the agent (it started or won the lease to start the run), `{ action: 'deliver', runId }` when the signal is forwarded onto an existing run (including when this process loses a cross-process wake race), or `{ action: 'persist' }` / `{ action: 'discard' }` when nothing ran. `action` mirrors the winning `behavior` from `ifActive`/`ifIdle`. `runId` is the authoritative id of the run that handled the signal and is present only on `wake` and `deliver`; for `persist`/`discard` use `result.signal.id` to correlate the stored signal. `accepted` resolves for routing — a generation error on a `wake` run surfaces through `output.consumeStream()` — and rejects only when the signal could not be routed or started at all (e.g. a misconfigured agent). `persisted` is only present for `persist` behavior and resolves when Mastra finishes writing the signal to memory. On the `wake` action, `output` is the agent stream for in-process consumption.

In serverless handlers, await `accepted` and pass the `wake` output to your platform's `waitUntil` equivalent so the winning process can drain the stream after the HTTP response returns.

```typescript
const result = agent.sendSignal(signal, { resourceId, threadId })
ctx.waitUntil(
  result.accepted.then(async accepted => {
    if (accepted.action === 'wake') {
      await accepted.output.consumeStream()
    }
  }),
)
```

### `sendStateSignal(state, options)` [Direct link to sendstatesignalstate-options](https://mastra.ai/reference/agents/agent\#sendstatesignalstate-options "Direct link to sendstatesignalstate-options")

Sends named, thread-scoped state context to an active run or memory thread. Use this when an external producer owns durable context that changes over time, such as browser state, editor state, or watcher output.

```typescript
const result = await agent.sendStateSignal(
  {
    id: 'browser',
    mode: 'snapshot',
    cacheKey: 'browser:https://example.com:3-tabs',
    contents: 'Browser is open. Active tab URL: https://example.com. 3 open tabs.',
    value: {
      activeUrl: 'https://example.com',
      tabCount: 3,
      open: true,
    },
  },
  {
    resourceId: 'user-123',
    threadId: 'thread-abc',
  },
)
```

### state:

object

State signal to send to the thread.

object

### id:

string

State lane name, such as \`browser\` or \`editor\`.

### cacheKey:

string

Producer-owned key Mastra uses to skip duplicate state for the same lane and mode.

### contents:

string \| Array<TextPart \| FilePart>

LLM-facing representation of the state.

### mode?:

'snapshot' \| 'delta'

Whether the state is an authoritative snapshot or a change event. Defaults to \`snapshot\`.

### value?:

unknown

Structured snapshot value for \`mode: 'snapshot'\`.

### delta?:

unknown

Structured change value for \`mode: 'delta'\`.

### attributes?:

Record<string, string \| number \| boolean>

Attributes rendered on the state signal tag.

### metadata?:

Record<string, unknown>

Application metadata stored with the state signal.

### tagName?:

string

XML tag name shown to the model. Defaults to \`state\`.

### options:

object

Targeting and delivery behavior for the state signal. Accepts the same options as \`sendSignal()\`.

Returns `{ accepted: Promise<SendAgentSignalAccepted>, signal: CreatedAgentSignal, persisted?: Promise<void>, skipped?: false }` when Mastra accepts new state. Returns `{ skipped: true, reason: 'unchanged' }` when the same `cacheKey` and mode are already current for the state lane. `accepted` resolves at decision-time, once Mastra decides what to do with the signal: `{ action: 'wake', runId, output }` when this process runs the agent (it started or won the lease to start the run), `{ action: 'deliver', runId }` when the signal is forwarded onto an existing run (including when this process loses a cross-process wake race), or `{ action: 'persist' }` / `{ action: 'discard' }` when nothing ran. `runId` is the authoritative id of the run that handled the signal and is present only on `wake` and `deliver`; for `persist`/`discard` use `result.signal.id` to correlate the stored signal. On the `wake` action, `output` is the agent stream for in-process consumption.

### `sendNotificationSignal(notification, options)` [Direct link to sendnotificationsignalnotification-options](https://mastra.ai/reference/agents/agent\#sendnotificationsignalnotification-options "Direct link to sendnotificationsignalnotification-options")

Creates or coalesces a notification inbox record, resolves the notification delivery policy, and sends a notification signal when the decision is immediate.

```typescript
const result = await agent.sendNotificationSignal(
  {
    source: 'github',
    kind: 'ci-status',
    priority: 'high',
    summary: 'CI failed on main: 3 tests failed.',
    dedupeKey: 'github:acme/app:main:ci',
  },
  {
    resourceId: 'user-123',
    threadId: 'thread-abc',
  },
)
```

### notification:

object

Notification inbox record to create or coalesce.

object

### source:

string

External system that produced the notification, such as \`github\`, \`slack\`, or \`email\`.

### kind:

string

Notification kind within the source, such as \`ci-status\`, \`mention\`, or \`direct-message\`.

### summary:

string

LLM-facing summary used as the notification signal contents.

### priority?:

'low' \| 'medium' \| 'high' \| 'urgent'

Priority used by the notification delivery policy. Defaults to \`medium\`.

### payload?:

unknown

Structured payload stored on the inbox record for tools or application code.

### dedupeKey?:

string

Key used to coalesce duplicate pending notifications from the same source and thread.

### coalesceKey?:

string

Key used to combine related pending notifications from the same source and thread.

### attributes?:

Record<string, JSONValue>

Extra attributes copied onto the emitted notification signal.

### metadata?:

Record<string, unknown>

Application metadata stored on the inbox record.

### options:

object

Target thread and wake-up behavior for the notification.

object

### resourceId:

string

Resource ID for the notification inbox and target memory thread.

### threadId:

string

Thread ID for the notification inbox and target memory thread.

### ifIdle?:

object

Controls what happens when the target thread is idle.

object

### streamOptions?:

AgentExecutionOptions

Options for the stream that starts when an immediate notification wakes an idle thread.

Returns `{ record: NotificationRecord, decision: NotificationDeliveryDecision, runId?: string, signal?: CreatedAgentSignal, persisted?: Promise<void>, accepted?: Promise<SendAgentSignalAccepted> }`. `record` is the stored inbox record. `decision` is the delivery-policy result. `signal` and `runId` are present when ingress emits a signal immediately, including the immediate summary emitted for active high-priority notifications. `persisted` is present when the emitted signal is persisted without waking an idle thread. `accepted` is present when a signal is emitted and resolves at decision-time, once Mastra decides what to do with it: `{ action: 'wake', runId, output }` when this process runs the agent (it started or won the lease to start the run), `{ action: 'deliver', runId }` when the signal is forwarded onto an existing run, or `{ action: 'persist' }` / `{ action: 'discard' }` when nothing ran. `runId` on the accepted result is present only on `wake` and `deliver`. On the `wake` action, `output` is the agent stream for in-process consumption.

Default delivery is priority-aware. `urgent` notifications deliver immediately. `high` notifications deliver immediately when the thread is idle; when the thread is active, Mastra emits a summary immediately and keeps `deliverAt` for later full delivery when the thread is idle. `medium` notifications deliver immediately when idle and batch into summaries when active. `low` notifications batch into summaries in both active and idle threads; idle low-priority summaries reach subscribers without waking the model loop. For the full flow, visit [Signals](https://mastra.ai/docs/agents/signals#notification-signals).

Configure `notifications.deliveryPolicy` on the agent when some notifications should wait for a different dispatch window or summary rollup:

src/mastra/agents/support-agent.ts

```typescript
export const supportAgent = new Agent({
  id: 'support-agent',
  name: 'Support Agent',
  instructions: 'Help the user triage updates.',
  model: 'openai/gpt-5.5',
  notifications: {
    deliveryPolicy: {
      priorities: {
        urgent: 'deliver',
      },
      decide: ({ record }) => {
        if (record.priority === 'low') {
          return {
            action: 'summarize',
            summaryAt: new Date(Date.now() + 30 * 60 * 1000),
          }
        }
      },
    },
  },
})
```

### `subscribeToThread(options)` [Direct link to subscribetothreadoptions](https://mastra.ai/reference/agents/agent\#subscribetothreadoptions "Direct link to subscribetothreadoptions")

Subscribes to raw stream chunks for a memory thread. Use this before calling `sendMessage()`, `queueMessage()`, or `sendSignal()` when you need to render stream output, observe signal echoes, or abort the active run.

### options:

object

Thread subscription target.

object

### resourceId?:

string

Resource ID for the memory thread.

### threadId:

string

Thread ID to subscribe to.

Returns an `AgentThreadSubscription` object with these members:

### stream:

AsyncIterable<AgentChunkType>

Raw agent stream chunks for the subscribed thread.

### activeRunId:

() =\> string \| null

Returns the active run ID for the thread, or \`null\` when no run is active.

### abort:

() =\> boolean

Aborts the active run for the thread. Returns \`true\` when a run was aborted.

### unsubscribe:

() =\> void

Stops the subscription without aborting the active run.

## Constructor parameters [Direct link to Constructor parameters](https://mastra.ai/reference/agents/agent\#constructor-parameters "Direct link to Constructor parameters")

### id?:

string

Unique identifier for the agent. Defaults to \`name\` if not provided.

### name:

string

Display name for the agent. Used as the identifier if \`id\` is not provided.

### description?:

string

Optional description of the agent's purpose and capabilities.

### metadata?:

Record<string, unknown> \| ({ requestContext: RequestContext }) => Record<string, unknown> \| Promise<Record<string, unknown>>

Optional metadata for classifying or filtering the agent in clients. Can be a static record or a function that resolves the metadata from the request context.

### instructions:

SystemMessage \| ({ requestContext: RequestContext }) => SystemMessage \| Promise<SystemMessage>

Instructions that guide the agent's behavior. Can be a string, array of strings, system message object,
array of system messages, or a function that returns any of these types dynamically.
SystemMessage types: string \| string\[\] \| CoreSystemMessage \| CoreSystemMessage\[\] \| SystemModelMessage \| SystemModelMessage\[\]

### model:

MastraLanguageModel \| ({ requestContext: RequestContext }) => MastraLanguageModel \| Promise<MastraLanguageModel>

The language model used by the agent. Can be provided statically or resolved at runtime.

### agents?:

Record<string, Agent> \| ({ requestContext: RequestContext }) => Record<string, Agent> \| Promise<Record<string, Agent>>

Subagents that the agent can access. Can be provided statically or resolved dynamically.

### tools?:

ToolsInput \| ({ requestContext: RequestContext }) => ToolsInput \| Promise<ToolsInput>

Tools that the agent can access. Can be provided statically or resolved dynamically.

### hooks?:

ToolHooks

Hooks that run before and after every tool call made by this agent. Per-execution hooks passed to \`generate()\` or \`stream()\` override matching hooks set here. See Tool hooks below.

ToolHooks

### beforeToolCall?:

(context: ToolHookContext) => void \| ToolBeforeHookResult \| Promise<void \| ToolBeforeHookResult>

Runs before a tool executes. Receives \`{ toolName, input, context, metadata }\`. Return \`{ proceed: false, output }\` to skip the tool call and use \`output\` as its result.

### afterToolCall?:

(context: ToolAfterHookContext) => void \| Promise<void>

Runs after a tool executes. Receives \`{ toolName, input, context, metadata, output, error }\`. \`output\` is undefined when the tool throws, and \`error\` is set instead.

### transform?:

ToolPayloadTransformPolicy

Shared policy for transforming tool payloads before display streams or user-visible transcript messages receive them. Use per-tool \`transform\` on \`createTool()\` for tool-local rules.

### workflows?:

Record<string, Workflow> \| ({ requestContext: RequestContext }) => Record<string, Workflow> \| Promise<Record<string, Workflow>>

Workflows that the agent can execute. Can be static or dynamically resolved.

### defaultOptions?:

AgentExecutionOptions \| ({ requestContext: RequestContext }) => AgentExecutionOptions \| Promise<AgentExecutionOptions>

Default options used when calling \`stream()\` and \`generate()\`.

### defaultGenerateOptionsLegacy?:

AgentGenerateOptions \| ({ requestContext: RequestContext }) => AgentGenerateOptions \| Promise<AgentGenerateOptions>

Default options used when calling \`generateLegacy()\`.

### defaultStreamOptionsLegacy?:

AgentStreamOptions \| ({ requestContext: RequestContext }) => AgentStreamOptions \| Promise<AgentStreamOptions>

Default options used when calling \`streamLegacy()\`.

### mastra?:

Mastra

Reference to the Mastra runtime instance (injected automatically).

### scorers?:

MastraScorers \| ({ requestContext: RequestContext }) => MastraScorers \| Promise<MastraScorers>

Scoring configuration for runtime evaluation and telemetry. Can be static or dynamically provided.

### memory?:

MastraMemory \| ({ requestContext: RequestContext }) => MastraMemory \| Promise<MastraMemory>

Memory module used for storing and retrieving stateful context.

### notifications?:

object

Notification delivery configuration for durable notification signals.

object

### deliveryPolicy?:

NotificationDeliveryPolicyConfig

Controls how notification records are delivered. Configure a default decision, per-priority decisions, per-source decisions, or a custom \`decide()\` function.

### voice?:

CompositeVoice

Voice settings for speech input and output.

### inputProcessors?:

(Processor \| ProcessorWorkflow)\[\] \| ({ requestContext: RequestContext }) => (Processor \| ProcessorWorkflow)\[\] \| Promise<(Processor \| ProcessorWorkflow)\[\]>

Input processors that can modify or validate messages before they are processed by the agent. Can be individual Processor objects or workflows created with \`createWorkflow()\` using ProcessorStepSchema.

### outputProcessors?:

(Processor \| ProcessorWorkflow)\[\] \| ({ requestContext: RequestContext }) => (Processor \| ProcessorWorkflow)\[\] \| Promise<(Processor \| ProcessorWorkflow)\[\]>

Output processors that can modify or validate messages from the agent before they are sent to the client. Can be individual Processor objects or workflows.

### maxProcessorRetries?:

number

Maximum number of times a processor can request retrying the LLM step.

### requestContextSchema?:

StandardJSONSchemaV1

Standard JSON Schema for validating request context values. When provided, the context is validated at the start of generate() or stream(), throwing a MastraError if validation fails.

### editor?:

false \| { instructions?: boolean; tools?: boolean \| { description?: boolean } }

Controls which fields the editor can override for this code-defined agent. Omit to allow editing instructions and tools. See Editor overrides below.

## Tool hooks [Direct link to Tool hooks](https://mastra.ai/reference/agents/agent\#tool-hooks "Direct link to Tool hooks")

Use `hooks` to run logic around every tool call the agent makes, including assigned tools, memory tools, toolsets, client tools, and workspace tools.

src/mastra/agents/hooked-agent.ts

```typescript
import { Agent } from '@mastra/core/agent'

export const agent = new Agent({
  name: 'support-agent',
  instructions: 'Help users with their questions.',
  model: 'openai/gpt-5.5',
  hooks: {
    beforeToolCall: ({ toolName, input }) => {
      console.log(`Running ${toolName}`, input)
    },
    afterToolCall: ({ toolName, output, error }) => {
      console.log(`Finished ${toolName}`, { output, error })
    },
  },
})
```

`beforeToolCall` can short-circuit the tool call by returning `{ proceed: false, output }`. The agent skips execution and uses `output` as the tool result:

```typescript
const result = await agent.generate('Clean up old records', {
  hooks: {
    beforeToolCall: ({ toolName }) => {
      if (toolName === 'deleteRecord') {
        return { proceed: false, output: { blocked: true } }
      }
    },
  },
})
```

The hook context `metadata` includes `agentId` and `agentName`. Per-execution hooks passed to `generate()` or `stream()` override matching agent-level hooks. When a [workspace](https://mastra.ai/reference/workspace/workspace-class) also defines `tools.hooks`, workspace hooks run inside the agent hook wrapper.

## Editor overrides [Direct link to Editor overrides](https://mastra.ai/reference/agents/agent\#editor-overrides "Direct link to Editor overrides")

When you register the [`MastraEditor`](https://mastra.ai/reference/editor/mastra-editor), the `editor` field controls which parts of a code-defined agent can be changed through the editor. Fields owned by code are read-only in Studio and are stripped from saved overrides.

### editor?:

false \| { instructions?: boolean; tools?: boolean \| { description?: boolean } }

Omit to allow editing instructions and tools. Set to \`false\` to lock the agent. Set \`instructions: true\` to allow instruction edits. Set \`tools: true\` to allow tool membership and description edits, or \`tools: { description: true }\` to allow only description edits.

The agent's `id`, `name`, and `model` always come from code and can't be overridden through the editor. See the [Editor overview](https://mastra.ai/docs/editor/overview) for usage.

## Returns [Direct link to Returns](https://mastra.ai/reference/agents/agent\#returns "Direct link to Returns")

### agent:

Agent<TAgentId, TTools>

A new Agent instance with the specified configuration.

On this page

- [Usage examples](https://mastra.ai/reference/agents/agent#usage-examples)
  - [Basic string instructions](https://mastra.ai/reference/agents/agent#basic-string-instructions)
  - [Provider-specific configurations](https://mastra.ai/reference/agents/agent#provider-specific-configurations)
  - [Mixed instruction formats](https://mastra.ai/reference/agents/agent#mixed-instruction-formats)
- [Thread signals](https://mastra.ai/reference/agents/agent#thread-signals)
  - [`sendMessage(message, options)`](https://mastra.ai/reference/agents/agent#sendmessagemessage-options)
  - [`queueMessage(message, options)`](https://mastra.ai/reference/agents/agent#queuemessagemessage-options)
  - [`sendSignal(signal, options)`](https://mastra.ai/reference/agents/agent#sendsignalsignal-options)
  - [`sendStateSignal(state, options)`](https://mastra.ai/reference/agents/agent#sendstatesignalstate-options)
  - [`sendNotificationSignal(notification, options)`](https://mastra.ai/reference/agents/agent#sendnotificationsignalnotification-options)
  - [`subscribeToThread(options)`](https://mastra.ai/reference/agents/agent#subscribetothreadoptions)
- [Constructor parameters](https://mastra.ai/reference/agents/agent#constructor-parameters)
- [Tool hooks](https://mastra.ai/reference/agents/agent#tool-hooks)
- [Editor overrides](https://mastra.ai/reference/agents/agent#editor-overrides)
- [Returns](https://mastra.ai/reference/agents/agent#returns)

Mastra Newsletter

SubscribeShare feedback

reCAPTCHA

Recaptcha requires verification.

protected by **reCAPTCHA**