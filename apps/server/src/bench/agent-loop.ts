/**
 * Minimal OpenAI-compatible tool-calling loop that drives the REAL read/find/edit
 * tools (the same factories used by the production landing-page agent) against a
 * live OpenRouter `/chat/completions` endpoint.
 *
 * The model string is sent verbatim in the request body, so it works for both
 * providers without Mastra router/gateway prefix parsing. This scores how well a
 * given model can drive the anchor/hash protocol that read/find/edit depend on.
 */

import { createHtmlStore, type HtmlStore } from '../mastra/lib/html-store.ts'
import { createEditTool } from '../mastra/tools/edit.ts'
import { createFindTool } from '../mastra/tools/find.ts'
import { createReadTool } from '../mastra/tools/read.ts'
import type { ResolvedModel } from './models.ts'
import type { BenchTask } from './tasks.ts'
import { BENCH_TOOLS } from './tool-schemas.ts'

const SYSTEM_PROMPT = `You edit a single HTML document using three tools: read, find, and edit.

The document is stored as anchored lines and shown to you as "anchor|text", for example:
a1|<!doctype html>
a7|    <h1>Launch faster</h1>
a8|    <p class="subtitle">The platform for modern teams.</p>
Anchors are stable ids like a1, a2, ..., a1z, a20. They are NOT line numbers.

Workflow:
1. Call read (with offset/limit or range) or find (literal substring search by default) to see the current content and its anchors.
2. Call edit with edits: [{ operation, range, text }] referencing anchors you just observed. Never invent or guess anchors; always read or find first.
3. After a successful edit the document updates. Re-read before further edits if you are unsure of the current anchors.

edit operations: replace, delete, insert_before, insert_after.
range is [], [anchor], or [startAnchor, endAnchor] and is inclusive.
  [] means the whole document for replace, the document start for insert_before, and the document end for insert_after.
Omit text for delete. Batch related non-overlapping edits in a single call; all ranges resolve against the document as it was at the start of that call.

Do not paste HTML into the chat. Make every change with the edit tool. Use the fewest tool calls needed, then stop calling tools.`

export interface RunOptions {
  abortMs?: number
  maxOutputTokens?: number
  maxSteps?: number
}

export interface TaskOutcome {
  editsAttempted: number
  editsFailed: number
  editsSucceeded: number
  error?: string
  finalHtml: string
  inspectedBeforeEdit: boolean
  pass: boolean
  reason: string
  steps: number
  toolCalls: ToolCallCounts
  usage?: {
    completionTokens?: number
    promptTokens?: number
    totalTokens?: number
  }
}

export interface ToolCallCounts {
  edit: number
  find: number
  read: number
}

interface AssistantMessage {
  content: null | string
  role: 'assistant'
  tool_calls?: FunctionToolCall[]
}

type BenchMessage =
  | AssistantMessage
  | ToolMessage
  | { content: string; role: 'system' | 'user' }

interface BenchTools {
  edit: ToolFactory
  find: ToolFactory
  read: ToolFactory
}

interface ChatChoice {
  finish_reason?: string
  message?: {
    content?: null | string
    role: string
    tool_calls?: FunctionToolCall[]
  }
}

interface ChatResponse {
  choices?: ChatChoice[]
  usage?: {
    completion_tokens?: number
    prompt_tokens?: number
    total_tokens?: number
  }
}

interface ExecutedCall {
  ok: boolean
  /** Serialized result handed back to the model. */
  content: string
  tool: ToolName
}

interface FunctionToolCall {
  function: { arguments: string; name: string }
  id: string
  type: 'function'
}

interface ToolFactory {
  // Mastra tools expose an execute(args, context) returning the output object.
  // The edit tool throws on validation failure; find returns { ok:false, ... }.
  // We bypass Mastra's runtime and call execute directly, exactly like the
  // existing tool unit tests do.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute?: (args: any, context: any) => Promise<any>
}

interface ToolMessage {
  content: string
  role: 'tool'
  tool_call_id: string
}

type ToolName = 'edit' | 'find' | 'read'

function buildTools(store: HtmlStore): BenchTools {
  return {
    edit: createEditTool(store),
    find: createFindTool(store),
    read: createReadTool(store),
  }
}

async function executeToolCall(
  name: ToolName,
  args: Record<string, unknown>,
  tools: BenchTools,
): Promise<ExecutedCall> {
  const tool = tools[name]
  try {
    const result = await tool.execute!(args, undefined)
    return { content: JSON.stringify(result), ok: true, tool: name }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: JSON.stringify({ error: message, ok: false }),
      ok: false,
      tool: name,
    }
  }
}

function isToolName(name: string): name is ToolName {
  return name === 'edit' || name === 'find' || name === 'read'
}

function parseArguments(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return { __parseError: `Malformed tool arguments: ${raw.slice(0, 200)}` }
  }
}

const DEFAULT_MAX_STEPS = 8
const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_ABORT_MS = 120_000

interface CompletionResult {
  choice?: ChatChoice
  usage?: ChatResponse['usage']
}

export async function runTask(
  model: ResolvedModel,
  task: BenchTask,
  options: RunOptions = {},
): Promise<TaskOutcome> {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS
  const store = createHtmlStore(task.seed)
  const tools = buildTools(store)

  const toolCalls: ToolCallCounts = { edit: 0, find: 0, read: 0 }
  let editsAttempted = 0
  let editsFailed = 0
  let editsSucceeded = 0
  let inspectedBeforeEdit = false
  let steps = 0
  let error: string | undefined
  let usage: TaskOutcome['usage']

  const messages: BenchMessage[] = [
    { content: SYSTEM_PROMPT, role: 'system' },
    { content: task.prompt, role: 'user' },
  ]

  try {
    while (steps < maxSteps) {
      steps += 1
      const completion = await chatCompletion(model, messages, options)
      if (completion.usage) {
        usage = {
          completionTokens: completion.usage.completion_tokens,
          promptTokens: completion.usage.prompt_tokens,
          totalTokens: completion.usage.total_tokens,
        }
      }

      const choice = completion.choice
      const message = choice?.message
      if (!message) {
        error = 'No message in completion response'
        break
      }

      const toolCallsForStep = message.tool_calls ?? []
      messages.push({
        content: message.content ?? null,
        role: 'assistant',
        tool_calls: toolCallsForStep,
      })

      if (toolCallsForStep.length === 0) break

      for (const call of toolCallsForStep) {
        if (!isToolName(call.function.name)) {
          messages.push({
            content: JSON.stringify({
              error: `Unknown tool ${call.function.name}`,
            }),
            role: 'tool',
            tool_call_id: call.id,
          })
          continue
        }
        toolCalls[call.function.name] += 1
        const args = parseArguments(call.function.arguments)
        const executed = await executeToolCall(call.function.name, args, tools)
        messages.push({
          content: executed.content,
          role: 'tool',
          tool_call_id: call.id,
        })

        if (call.function.name === 'read' || call.function.name === 'find') {
          if (executed.ok) inspectedBeforeEdit = true
        }
        if (call.function.name === 'edit') {
          editsAttempted += 1
          editsSucceeded += executed.ok ? 1 : 0
          editsFailed += executed.ok ? 0 : 1
        }
      }
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  }

  const finalHtml = store.get()
  const checkResult = task.check(finalHtml)
  const reason = error
    ? `error: ${error}`
    : checkResult.ok
      ? 'ok'
      : checkResult.reason

  return {
    editsAttempted,
    editsFailed,
    editsSucceeded,
    error,
    finalHtml,
    inspectedBeforeEdit,
    pass: !error && checkResult.ok,
    reason,
    steps,
    toolCalls,
    usage,
  }
}

async function chatCompletion(
  model: ResolvedModel,
  messages: BenchMessage[],
  options: RunOptions,
): Promise<CompletionResult> {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    options.abortMs ?? DEFAULT_ABORT_MS,
  )
  try {
    const response = await fetch(`${model.baseUrl}/chat/completions`, {
      body: JSON.stringify({
        max_tokens: options.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
        messages,
        model: model.model,
        temperature: 0,
        tool_choice: 'auto',
        tools: BENCH_TOOLS,
      }),
      headers: {
        authorization: `Bearer ${model.apiKey}`,
        'content-type': 'application/json',
        ...model.headers,
      },
      method: 'POST',
      signal: controller.signal,
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`)
    }
    const data = (await response.json()) as ChatResponse
    return { choice: data.choices?.[0], usage: data.usage }
  } finally {
    clearTimeout(timeout)
  }
}
