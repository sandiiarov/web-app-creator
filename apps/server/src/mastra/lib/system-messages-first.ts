import type { ProcessLLMRequestArgs, Processor } from '@mastra/core/processors'

/**
 * Provider-compat guard: some OpenRouter upstreams (vLLM-style chat
 * templates — AkashML, Chutes, Io Net, …) reject any request whose prompt
 * carries more than one `system` message or a `system` message anywhere but
 * index 0 ("System message must be at the beginning"). Mastra emits several
 * system messages (agent instructions, skills notice, observational-memory
 * context, per-step injections), which tolerant providers accept but strict
 * ones 400 on. Runs at the provider boundary (`processLLMRequest`) so the
 * merge is wire-only — MessageList keeps its separate system buckets.
 */
export class SystemMessagesFirstProcessor implements Processor<'system-messages-first'> {
  readonly id = 'system-messages-first' as const
  readonly name = 'System Messages First'

  processLLMRequest({ prompt }: ProcessLLMRequestArgs) {
    const systems = prompt.filter((m) => m.role === 'system')
    const firstIsOnlySystem =
      systems.length <= 1 && (systems.length === 0 || prompt[0] === systems[0])
    if (firstIsOnlySystem) return undefined

    const merged = systems
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .filter((content) => content.length > 0)
      .join('\n\n')
    const rest = prompt.filter((m) => m.role !== 'system')
    return {
      prompt:
        merged.length > 0
          ? [{ content: merged, role: 'system' as const }, ...rest]
          : rest,
    }
  }
}
