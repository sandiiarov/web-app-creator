import { w as withoutTrailingSlash, p as parseProviderOptions, U as UnsupportedFunctionalityError, c as combineHeaders, r as resolve, a as postJsonToApi, b as createJsonResponseHandler, d as createEventSourceResponseHandler, l as loadApiKey, e as convertUint8ArrayToBase64, f as createJsonErrorResponseHandler, N as NoSuchModelError } from './dist-CB67HEFG.mjs';
import { z } from 'zod';
import './index.mjs';
import '@mastra/core/evals/scoreTraces';
import '@mastra/core/agent';
import '@mastra/core/mastra';
import '@mastra/core/storage';
import '@mastra/duckdb';
import '@mastra/libsql';
import '@mastra/loggers';
import '@mastra/observability';
import 'node:process';
import './tools/44cd3deb-8c1f-4102-8a66-23e688623282.mjs';
import '@mastra/core/tools';
import './tools/cc407efd-a0c5-4276-940e-152d3f508985.mjs';
import './tools/257d5479-3729-4487-a4c5-f050640bca6f.mjs';
import 'node:fs';
import 'node:os';
import 'node:path';
import '@mastra/core/skills';
import 'fs/promises';
import 'https';
import 'path';
import 'url';
import 'http';
import 'http2';
import 'stream';
import 'crypto';
import 'fs';
import 'process';
import 'zod/v4';
import '@mastra/core/memory';
import '@mastra/core/auth/ee';
import 'zod/v3';
import '@mastra/core/schema';
import '@mastra/core/utils/zod-to-json';
import '@mastra/core/agent/durable';
import '@mastra/core/di';
import '@mastra/core/error';
import '@mastra/core/llm';
import '@mastra/core/workspace';
import '@mastra/core/request-context';
import '@mastra/core/processors';
import '@mastra/core/workflows';
import '@mastra/core/features';
import '@mastra/core/utils';
import '@mastra/core/observability';
import '@mastra/core/evals';
import 'util';
import '@mastra/core/a2a';
import 'dns/promises';
import 'net';
import '@mastra/core/stream';
import 'stream/promises';
import '@mastra/core/server';
import 'buffer';
import './tools.mjs';
import 'diagnostics_channel';
import 'child_process';
import 'module';
import 'os';
import 'async_hooks';

var anthropicErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string()
  }),
  type: z.literal("error")
});
var anthropicFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: anthropicErrorDataSchema,
  errorToMessage: (data) => data.error.message
});
function convertToAnthropicMessagesPrompt({
  prompt,
  sendReasoning,
  warnings
}) {
  var _a, _b, _c, _d;
  const betas = /* @__PURE__ */ new Set();
  const blocks = groupIntoBlocks(prompt);
  let system = void 0;
  const messages = [];
  function getCacheControl(providerMetadata) {
    var _a2;
    const anthropic2 = providerMetadata == null ? void 0 : providerMetadata.anthropic;
    const cacheControlValue = (_a2 = anthropic2 == null ? void 0 : anthropic2.cacheControl) != null ? _a2 : anthropic2 == null ? void 0 : anthropic2.cache_control;
    return cacheControlValue;
  }
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const isLastBlock = i === blocks.length - 1;
    const type = block.type;
    switch (type) {
      case "assistant": {
        const anthropicContent = [];
        for (let j = 0; j < block.messages.length; j++) {
          const message = block.messages[j];
          const isLastMessage = j === block.messages.length - 1;
          const { content } = message;
          for (let k = 0; k < content.length; k++) {
            const part = content[k];
            const isLastContentPart = k === content.length - 1;
            const cacheControl = (_d = getCacheControl(part.providerMetadata)) != null ? _d : isLastContentPart ? getCacheControl(message.providerMetadata) : void 0;
            switch (part.type) {
              case "reasoning": {
                if (sendReasoning) {
                  anthropicContent.push({
                    cache_control: cacheControl,
                    signature: part.signature,
                    thinking: part.text,
                    type: "thinking"
                  });
                } else {
                  warnings.push({
                    message: "sending reasoning content is disabled for this model",
                    type: "other"
                  });
                }
                break;
              }
              case "redacted-reasoning": {
                anthropicContent.push({
                  cache_control: cacheControl,
                  data: part.data,
                  type: "redacted_thinking"
                });
                break;
              }
              case "text": {
                anthropicContent.push({
                  cache_control: cacheControl,
                  text: (
                    // trim the last text part if it's the last message in the block
                    // because Anthropic does not allow trailing whitespace
                    // in pre-filled assistant responses
                    isLastBlock && isLastMessage && isLastContentPart ? part.text.trim() : part.text
                  ),
                  type: "text"
                });
                break;
              }
              case "tool-call": {
                anthropicContent.push({
                  cache_control: cacheControl,
                  id: part.toolCallId,
                  input: part.args,
                  name: part.toolName,
                  type: "tool_use"
                });
                break;
              }
            }
          }
        }
        messages.push({ content: anthropicContent, role: "assistant" });
        break;
      }
      case "system": {
        if (system != null) {
          throw new UnsupportedFunctionalityError({
            functionality: "Multiple system messages that are separated by user/assistant messages"
          });
        }
        system = block.messages.map(({ content, providerMetadata }) => ({
          cache_control: getCacheControl(providerMetadata),
          text: content,
          type: "text"
        }));
        break;
      }
      case "user": {
        const anthropicContent = [];
        for (const message of block.messages) {
          const { content, role } = message;
          switch (role) {
            case "tool": {
              for (let i2 = 0; i2 < content.length; i2++) {
                const part = content[i2];
                const isLastPart = i2 === content.length - 1;
                const cacheControl = (_c = getCacheControl(part.providerMetadata)) != null ? _c : isLastPart ? getCacheControl(message.providerMetadata) : void 0;
                const toolResultContent = part.content != null ? part.content.map((part2) => {
                  var _a2;
                  switch (part2.type) {
                    case "image":
                      return {
                        type: "image",
                        source: {
                          type: "base64",
                          media_type: (_a2 = part2.mimeType) != null ? _a2 : "image/jpeg",
                          data: part2.data
                        },
                        cache_control: void 0
                      };
                    case "text":
                      return {
                        type: "text",
                        text: part2.text,
                        cache_control: void 0
                      };
                  }
                }) : JSON.stringify(part.result);
                anthropicContent.push({
                  cache_control: cacheControl,
                  content: toolResultContent,
                  is_error: part.isError,
                  tool_use_id: part.toolCallId,
                  type: "tool_result"
                });
              }
              break;
            }
            case "user": {
              for (let j = 0; j < content.length; j++) {
                const part = content[j];
                const isLastPart = j === content.length - 1;
                const cacheControl = (_a = getCacheControl(part.providerMetadata)) != null ? _a : isLastPart ? getCacheControl(message.providerMetadata) : void 0;
                switch (part.type) {
                  case "file": {
                    if (part.mimeType !== "application/pdf") {
                      throw new UnsupportedFunctionalityError({
                        functionality: "Non-PDF files in user messages"
                      });
                    }
                    betas.add("pdfs-2024-09-25");
                    anthropicContent.push({
                      type: "document",
                      source: part.data instanceof URL ? {
                        type: "url",
                        url: part.data.toString()
                      } : {
                        type: "base64",
                        media_type: "application/pdf",
                        data: part.data
                      },
                      cache_control: cacheControl
                    });
                    break;
                  }
                  case "image": {
                    anthropicContent.push({
                      type: "image",
                      source: part.image instanceof URL ? {
                        type: "url",
                        url: part.image.toString()
                      } : {
                        type: "base64",
                        media_type: (_b = part.mimeType) != null ? _b : "image/jpeg",
                        data: convertUint8ArrayToBase64(part.image)
                      },
                      cache_control: cacheControl
                    });
                    break;
                  }
                  case "text": {
                    anthropicContent.push({
                      type: "text",
                      text: part.text,
                      cache_control: cacheControl
                    });
                    break;
                  }
                }
              }
              break;
            }
            default: {
              const _exhaustiveCheck = role;
              throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
            }
          }
        }
        messages.push({ content: anthropicContent, role: "user" });
        break;
      }
      default: {
        const _exhaustiveCheck = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }
  return {
    betas,
    prompt: { messages, system }
  };
}
function groupIntoBlocks(prompt) {
  const blocks = [];
  let currentBlock = void 0;
  for (const message of prompt) {
    const { role } = message;
    switch (role) {
      case "assistant": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "assistant") {
          currentBlock = { messages: [], type: "assistant" };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      case "system": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "system") {
          currentBlock = { messages: [], type: "system" };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      case "tool": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "user") {
          currentBlock = { messages: [], type: "user" };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      case "user": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "user") {
          currentBlock = { messages: [], type: "user" };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      default: {
        const _exhaustiveCheck = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }
  return blocks;
}
function mapAnthropicStopReason(finishReason) {
  switch (finishReason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool-calls";
    default:
      return "unknown";
  }
}
function prepareTools(mode) {
  var _a;
  const tools = ((_a = mode.tools) == null ? void 0 : _a.length) ? mode.tools : void 0;
  const toolWarnings = [];
  const betas = /* @__PURE__ */ new Set();
  if (tools == null) {
    return { betas, tool_choice: void 0, tools: void 0, toolWarnings };
  }
  const anthropicTools2 = [];
  for (const tool of tools) {
    switch (tool.type) {
      case "function":
        anthropicTools2.push({
          description: tool.description,
          input_schema: tool.parameters,
          name: tool.name
        });
        break;
      case "provider-defined":
        switch (tool.id) {
          case "anthropic.bash_20241022":
            betas.add("computer-use-2024-10-22");
            anthropicTools2.push({
              name: tool.name,
              type: "bash_20241022"
            });
            break;
          case "anthropic.bash_20250124":
            betas.add("computer-use-2025-01-24");
            anthropicTools2.push({
              name: tool.name,
              type: "bash_20250124"
            });
            break;
          case "anthropic.computer_20241022":
            betas.add("computer-use-2024-10-22");
            anthropicTools2.push({
              display_height_px: tool.args.displayHeightPx,
              display_number: tool.args.displayNumber,
              display_width_px: tool.args.displayWidthPx,
              name: tool.name,
              type: "computer_20241022"
            });
            break;
          case "anthropic.computer_20250124":
            betas.add("computer-use-2025-01-24");
            anthropicTools2.push({
              display_height_px: tool.args.displayHeightPx,
              display_number: tool.args.displayNumber,
              display_width_px: tool.args.displayWidthPx,
              name: tool.name,
              type: "computer_20250124"
            });
            break;
          case "anthropic.text_editor_20241022":
            betas.add("computer-use-2024-10-22");
            anthropicTools2.push({
              name: tool.name,
              type: "text_editor_20241022"
            });
            break;
          case "anthropic.text_editor_20250124":
            betas.add("computer-use-2025-01-24");
            anthropicTools2.push({
              name: tool.name,
              type: "text_editor_20250124"
            });
            break;
          default:
            toolWarnings.push({ tool, type: "unsupported-tool" });
            break;
        }
        break;
      default:
        toolWarnings.push({ tool, type: "unsupported-tool" });
        break;
    }
  }
  const toolChoice = mode.toolChoice;
  if (toolChoice == null) {
    return {
      betas,
      tool_choice: void 0,
      tools: anthropicTools2,
      toolWarnings
    };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
      return {
        betas,
        tool_choice: { type: "auto" },
        tools: anthropicTools2,
        toolWarnings
      };
    case "none":
      return { betas, tool_choice: void 0, tools: void 0, toolWarnings };
    case "required":
      return {
        betas,
        tool_choice: { type: "any" },
        tools: anthropicTools2,
        toolWarnings
      };
    case "tool":
      return {
        betas,
        tool_choice: { name: toolChoice.toolName, type: "tool" },
        tools: anthropicTools2,
        toolWarnings
      };
    default: {
      const _exhaustiveCheck = type;
      throw new UnsupportedFunctionalityError({
        functionality: `Unsupported tool choice type: ${_exhaustiveCheck}`
      });
    }
  }
}
var AnthropicMessagesLanguageModel = class {
  get provider() {
    return this.config.provider;
  }
  get supportsImageUrls() {
    return this.config.supportsImageUrls;
  }
  constructor(modelId, settings, config) {
    this.specificationVersion = "v1";
    this.defaultObjectGenerationMode = "tool";
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }
  buildRequestUrl(isStreaming) {
    var _a, _b, _c;
    return (_c = (_b = (_a = this.config).buildRequestUrl) == null ? void 0 : _b.call(_a, this.config.baseURL, isStreaming)) != null ? _c : `${this.config.baseURL}/messages`;
  }
  async doGenerate(options) {
    var _a, _b, _c, _d;
    const { args, betas, warnings } = await this.getArgs(options);
    const {
      rawValue: rawResponse,
      responseHeaders,
      value: response
    } = await postJsonToApi({
      abortSignal: options.abortSignal,
      body: this.transformRequestBody(args),
      failedResponseHandler: anthropicFailedResponseHandler,
      fetch: this.config.fetch,
      headers: await this.getHeaders({ betas, headers: options.headers }),
      successfulResponseHandler: createJsonResponseHandler(
        anthropicMessagesResponseSchema
      ),
      url: this.buildRequestUrl(false)
    });
    const { messages: rawPrompt, ...rawSettings } = args;
    let text = "";
    for (const content of response.content) {
      if (content.type === "text") {
        text += content.text;
      }
    }
    let toolCalls = void 0;
    if (response.content.some((content) => content.type === "tool_use")) {
      toolCalls = [];
      for (const content of response.content) {
        if (content.type === "tool_use") {
          toolCalls.push({
            args: JSON.stringify(content.input),
            toolCallId: content.id,
            toolCallType: "function",
            toolName: content.name
          });
        }
      }
    }
    const reasoning = response.content.filter(
      (content) => content.type === "redacted_thinking" || content.type === "thinking"
    ).map(
      (content) => content.type === "thinking" ? {
        signature: content.signature,
        text: content.thinking,
        type: "text"
      } : {
        data: content.data,
        type: "redacted"
      }
    );
    return {
      finishReason: mapAnthropicStopReason(response.stop_reason),
      providerMetadata: {
        anthropic: {
          cacheCreationInputTokens: (_c = response.usage.cache_creation_input_tokens) != null ? _c : null,
          cacheReadInputTokens: (_d = response.usage.cache_read_input_tokens) != null ? _d : null
        }
      },
      rawCall: { rawPrompt, rawSettings },
      rawResponse: {
        body: rawResponse,
        headers: responseHeaders
      },
      reasoning: reasoning.length > 0 ? reasoning : void 0,
      request: { body: JSON.stringify(args) },
      response: {
        id: (_a = response.id) != null ? _a : void 0,
        modelId: (_b = response.model) != null ? _b : void 0
      },
      text,
      toolCalls,
      usage: {
        completionTokens: response.usage.output_tokens,
        promptTokens: response.usage.input_tokens
      },
      warnings
    };
  }
  async doStream(options) {
    const { args, betas, warnings } = await this.getArgs(options);
    const body = { ...args, stream: true };
    const { responseHeaders, value: response } = await postJsonToApi({
      abortSignal: options.abortSignal,
      body: this.transformRequestBody(body),
      failedResponseHandler: anthropicFailedResponseHandler,
      fetch: this.config.fetch,
      headers: await this.getHeaders({ betas, headers: options.headers }),
      successfulResponseHandler: createEventSourceResponseHandler(
        anthropicMessagesChunkSchema
      ),
      url: this.buildRequestUrl(true)
    });
    const { messages: rawPrompt, ...rawSettings } = args;
    let finishReason = "unknown";
    const usage = {
      completionTokens: Number.NaN,
      promptTokens: Number.NaN
    };
    const toolCallContentBlocks = {};
    let providerMetadata = void 0;
    let blockType = void 0;
    return {
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      request: { body: JSON.stringify(body) },
      stream: response.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            var _a, _b, _c, _d;
            if (!chunk.success) {
              controller.enqueue({ error: chunk.error, type: "error" });
              return;
            }
            const value = chunk.value;
            switch (value.type) {
              case "content_block_delta": {
                const deltaType = value.delta.type;
                switch (deltaType) {
                  case "input_json_delta": {
                    const contentBlock = toolCallContentBlocks[value.index];
                    controller.enqueue({
                      type: "tool-call-delta",
                      toolCallType: "function",
                      toolCallId: contentBlock.toolCallId,
                      toolName: contentBlock.toolName,
                      argsTextDelta: value.delta.partial_json
                    });
                    contentBlock.jsonText += value.delta.partial_json;
                    return;
                  }
                  case "signature_delta": {
                    if (blockType === "thinking") {
                      controller.enqueue({
                        type: "reasoning-signature",
                        signature: value.delta.signature
                      });
                    }
                    return;
                  }
                  case "text_delta": {
                    controller.enqueue({
                      type: "text-delta",
                      textDelta: value.delta.text
                    });
                    return;
                  }
                  case "thinking_delta": {
                    controller.enqueue({
                      type: "reasoning",
                      textDelta: value.delta.thinking
                    });
                    return;
                  }
                  default: {
                    const _exhaustiveCheck = deltaType;
                    throw new Error(
                      `Unsupported delta type: ${_exhaustiveCheck}`
                    );
                  }
                }
              }
              case "message_start": {
                usage.promptTokens = value.message.usage.input_tokens;
                usage.completionTokens = value.message.usage.output_tokens;
                providerMetadata = {
                  anthropic: {
                    cacheCreationInputTokens: (_a = value.message.usage.cache_creation_input_tokens) != null ? _a : null,
                    cacheReadInputTokens: (_b = value.message.usage.cache_read_input_tokens) != null ? _b : null
                  }
                };
                controller.enqueue({
                  id: (_c = value.message.id) != null ? _c : void 0,
                  modelId: (_d = value.message.model) != null ? _d : void 0,
                  type: "response-metadata"
                });
                return;
              }
              case "content_block_start": {
                const contentBlockType = value.content_block.type;
                blockType = contentBlockType;
                switch (contentBlockType) {
                  case "redacted_thinking": {
                    controller.enqueue({
                      type: "redacted-reasoning",
                      data: value.content_block.data
                    });
                    return;
                  }
                  case "text":
                  case "thinking": {
                    return;
                  }
                  case "tool_use": {
                    toolCallContentBlocks[value.index] = {
                      jsonText: "",
                      toolCallId: value.content_block.id,
                      toolName: value.content_block.name
                    };
                    return;
                  }
                  default: {
                    const _exhaustiveCheck = contentBlockType;
                    throw new Error(
                      `Unsupported content block type: ${_exhaustiveCheck}`
                    );
                  }
                }
              }
              case "content_block_stop": {
                if (toolCallContentBlocks[value.index] != null) {
                  const contentBlock = toolCallContentBlocks[value.index];
                  controller.enqueue({
                    args: contentBlock.jsonText,
                    toolCallId: contentBlock.toolCallId,
                    toolCallType: "function",
                    toolName: contentBlock.toolName,
                    type: "tool-call"
                  });
                  delete toolCallContentBlocks[value.index];
                }
                blockType = void 0;
                return;
              }
              case "error": {
                controller.enqueue({ error: value.error, type: "error" });
                return;
              }
              case "message_delta": {
                usage.completionTokens = value.usage.output_tokens;
                finishReason = mapAnthropicStopReason(value.delta.stop_reason);
                return;
              }
              case "message_stop": {
                controller.enqueue({
                  finishReason,
                  providerMetadata,
                  type: "finish",
                  usage
                });
                return;
              }
              case "ping": {
                return;
              }
              default: {
                const _exhaustiveCheck = value;
                throw new Error(`Unsupported chunk type: ${_exhaustiveCheck}`);
              }
            }
          }
        })
      ),
      warnings
    };
  }
  async getArgs({
    frequencyPenalty,
    maxTokens = 4096,
    mode,
    presencePenalty,
    prompt,
    providerMetadata: providerOptions,
    responseFormat,
    seed,
    stopSequences,
    // 4096: max model output tokens TODO update default in v5
    temperature,
    topK,
    topP
  }) {
    var _a, _b, _c;
    const type = mode.type;
    const warnings = [];
    if (frequencyPenalty != null) {
      warnings.push({
        setting: "frequencyPenalty",
        type: "unsupported-setting"
      });
    }
    if (presencePenalty != null) {
      warnings.push({
        setting: "presencePenalty",
        type: "unsupported-setting"
      });
    }
    if (seed != null) {
      warnings.push({
        setting: "seed",
        type: "unsupported-setting"
      });
    }
    if (responseFormat != null && responseFormat.type !== "text") {
      warnings.push({
        details: "JSON response format is not supported.",
        setting: "responseFormat",
        type: "unsupported-setting"
      });
    }
    const { betas: messagesBetas, prompt: messagesPrompt } = convertToAnthropicMessagesPrompt({
      prompt,
      sendReasoning: (_a = this.settings.sendReasoning) != null ? _a : true,
      warnings
    });
    const anthropicOptions = parseProviderOptions({
      provider: "anthropic",
      providerOptions,
      schema: anthropicProviderOptionsSchema
    });
    const isThinking = ((_b = anthropicOptions == null ? void 0 : anthropicOptions.thinking) == null ? void 0 : _b.type) === "enabled";
    const thinkingBudget = (_c = anthropicOptions == null ? void 0 : anthropicOptions.thinking) == null ? void 0 : _c.budgetTokens;
    const baseArgs = {
      // standardized settings:
      max_tokens: maxTokens,
      // model id:
      model: this.modelId,
      stop_sequences: stopSequences,
      temperature,
      top_k: topK,
      top_p: topP,
      // provider specific settings:
      ...isThinking && {
        thinking: { budget_tokens: thinkingBudget, type: "enabled" }
      },
      messages: messagesPrompt.messages,
      // prompt:
      system: messagesPrompt.system
    };
    if (isThinking) {
      if (thinkingBudget == null) {
        throw new UnsupportedFunctionalityError({
          functionality: "thinking requires a budget"
        });
      }
      if (baseArgs.temperature != null) {
        baseArgs.temperature = void 0;
        warnings.push({
          details: "temperature is not supported when thinking is enabled",
          setting: "temperature",
          type: "unsupported-setting"
        });
      }
      if (topK != null) {
        baseArgs.top_k = void 0;
        warnings.push({
          details: "topK is not supported when thinking is enabled",
          setting: "topK",
          type: "unsupported-setting"
        });
      }
      if (topP != null) {
        baseArgs.top_p = void 0;
        warnings.push({
          details: "topP is not supported when thinking is enabled",
          setting: "topP",
          type: "unsupported-setting"
        });
      }
      baseArgs.max_tokens = maxTokens + thinkingBudget;
    }
    switch (type) {
      case "object-json": {
        throw new UnsupportedFunctionalityError({
          functionality: "json-mode object generation"
        });
      }
      case "object-tool": {
        const { description, name, parameters } = mode.tool;
        return {
          args: {
            ...baseArgs,
            tool_choice: { name, type: "tool" },
            tools: [{ description, input_schema: parameters, name }]
          },
          betas: messagesBetas,
          warnings
        };
      }
      case "regular": {
        const {
          betas: toolsBetas,
          tool_choice,
          tools,
          toolWarnings
        } = prepareTools(mode);
        return {
          args: { ...baseArgs, tool_choice, tools },
          betas: /* @__PURE__ */ new Set([...messagesBetas, ...toolsBetas]),
          warnings: [...warnings, ...toolWarnings]
        };
      }
      default: {
        const _exhaustiveCheck = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }
  async getHeaders({
    betas,
    headers
  }) {
    return combineHeaders(
      await resolve(this.config.headers),
      betas.size > 0 ? { "anthropic-beta": Array.from(betas).join(",") } : {},
      headers
    );
  }
  supportsUrl(url) {
    return url.protocol === "https:";
  }
  transformRequestBody(args) {
    var _a, _b, _c;
    return (_c = (_b = (_a = this.config).transformRequestBody) == null ? void 0 : _b.call(_a, args)) != null ? _c : args;
  }
};
var anthropicMessagesResponseSchema = z.object({
  content: z.array(
    z.discriminatedUnion("type", [
      z.object({
        text: z.string(),
        type: z.literal("text")
      }),
      z.object({
        signature: z.string(),
        thinking: z.string(),
        type: z.literal("thinking")
      }),
      z.object({
        data: z.string(),
        type: z.literal("redacted_thinking")
      }),
      z.object({
        id: z.string(),
        input: z.unknown(),
        name: z.string(),
        type: z.literal("tool_use")
      })
    ])
  ),
  id: z.string().nullish(),
  model: z.string().nullish(),
  stop_reason: z.string().nullish(),
  type: z.literal("message"),
  usage: z.object({
    cache_creation_input_tokens: z.number().nullish(),
    cache_read_input_tokens: z.number().nullish(),
    input_tokens: z.number(),
    output_tokens: z.number()
  })
});
var anthropicMessagesChunkSchema = z.discriminatedUnion("type", [
  z.object({
    message: z.object({
      id: z.string().nullish(),
      model: z.string().nullish(),
      usage: z.object({
        cache_creation_input_tokens: z.number().nullish(),
        cache_read_input_tokens: z.number().nullish(),
        input_tokens: z.number(),
        output_tokens: z.number()
      })
    }),
    type: z.literal("message_start")
  }),
  z.object({
    content_block: z.discriminatedUnion("type", [
      z.object({
        text: z.string(),
        type: z.literal("text")
      }),
      z.object({
        thinking: z.string(),
        type: z.literal("thinking")
      }),
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.literal("tool_use")
      }),
      z.object({
        data: z.string(),
        type: z.literal("redacted_thinking")
      })
    ]),
    index: z.number(),
    type: z.literal("content_block_start")
  }),
  z.object({
    delta: z.discriminatedUnion("type", [
      z.object({
        partial_json: z.string(),
        type: z.literal("input_json_delta")
      }),
      z.object({
        text: z.string(),
        type: z.literal("text_delta")
      }),
      z.object({
        thinking: z.string(),
        type: z.literal("thinking_delta")
      }),
      z.object({
        signature: z.string(),
        type: z.literal("signature_delta")
      })
    ]),
    index: z.number(),
    type: z.literal("content_block_delta")
  }),
  z.object({
    index: z.number(),
    type: z.literal("content_block_stop")
  }),
  z.object({
    error: z.object({
      message: z.string(),
      type: z.string()
    }),
    type: z.literal("error")
  }),
  z.object({
    delta: z.object({ stop_reason: z.string().nullish() }),
    type: z.literal("message_delta"),
    usage: z.object({ output_tokens: z.number() })
  }),
  z.object({
    type: z.literal("message_stop")
  }),
  z.object({
    type: z.literal("ping")
  })
]);
var anthropicProviderOptionsSchema = z.object({
  thinking: z.object({
    budgetTokens: z.number().optional(),
    type: z.union([z.literal("enabled"), z.literal("disabled")])
  }).optional()
});
var Bash20241022Parameters = z.object({
  command: z.string(),
  restart: z.boolean().optional()
});
function bashTool_20241022(options = {}) {
  return {
    args: {},
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent,
    id: "anthropic.bash_20241022",
    parameters: Bash20241022Parameters,
    type: "provider-defined"
  };
}
var Bash20250124Parameters = z.object({
  command: z.string(),
  restart: z.boolean().optional()
});
function bashTool_20250124(options = {}) {
  return {
    args: {},
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent,
    id: "anthropic.bash_20250124",
    parameters: Bash20250124Parameters,
    type: "provider-defined"
  };
}
var TextEditor20241022Parameters = z.object({
  command: z.enum(["view", "create", "str_replace", "insert", "undo_edit"]),
  file_text: z.string().optional(),
  insert_line: z.number().int().optional(),
  new_str: z.string().optional(),
  old_str: z.string().optional(),
  path: z.string(),
  view_range: z.array(z.number().int()).optional()
});
function textEditorTool_20241022(options = {}) {
  return {
    args: {},
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent,
    id: "anthropic.text_editor_20241022",
    parameters: TextEditor20241022Parameters,
    type: "provider-defined"
  };
}
var TextEditor20250124Parameters = z.object({
  command: z.enum(["view", "create", "str_replace", "insert", "undo_edit"]),
  file_text: z.string().optional(),
  insert_line: z.number().int().optional(),
  new_str: z.string().optional(),
  old_str: z.string().optional(),
  path: z.string(),
  view_range: z.array(z.number().int()).optional()
});
function textEditorTool_20250124(options = {}) {
  return {
    args: {},
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent,
    id: "anthropic.text_editor_20250124",
    parameters: TextEditor20250124Parameters,
    type: "provider-defined"
  };
}
var Computer20241022Parameters = z.object({
  action: z.enum([
    "key",
    "type",
    "mouse_move",
    "left_click",
    "left_click_drag",
    "right_click",
    "middle_click",
    "double_click",
    "screenshot",
    "cursor_position"
  ]),
  coordinate: z.array(z.number().int()).optional(),
  text: z.string().optional()
});
function computerTool_20241022(options) {
  return {
    args: {
      displayHeightPx: options.displayHeightPx,
      displayNumber: options.displayNumber,
      displayWidthPx: options.displayWidthPx
    },
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent,
    id: "anthropic.computer_20241022",
    parameters: Computer20241022Parameters,
    type: "provider-defined"
  };
}
var Computer20250124Parameters = z.object({
  action: z.enum([
    "key",
    "hold_key",
    "type",
    "cursor_position",
    "mouse_move",
    "left_mouse_down",
    "left_mouse_up",
    "left_click",
    "left_click_drag",
    "right_click",
    "middle_click",
    "double_click",
    "triple_click",
    "scroll",
    "wait",
    "screenshot"
  ]),
  coordinate: z.tuple([z.number().int(), z.number().int()]).optional(),
  duration: z.number().optional(),
  scroll_amount: z.number().optional(),
  scroll_direction: z.enum(["up", "down", "left", "right"]).optional(),
  start_coordinate: z.tuple([z.number().int(), z.number().int()]).optional(),
  text: z.string().optional()
});
function computerTool_20250124(options) {
  return {
    args: {
      displayHeightPx: options.displayHeightPx,
      displayNumber: options.displayNumber,
      displayWidthPx: options.displayWidthPx
    },
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent,
    id: "anthropic.computer_20250124",
    parameters: Computer20250124Parameters,
    type: "provider-defined"
  };
}
var anthropicTools = {
  bash_20241022: bashTool_20241022,
  bash_20250124: bashTool_20250124,
  computer_20241022: computerTool_20241022,
  computer_20250124: computerTool_20250124,
  textEditor_20241022: textEditorTool_20241022,
  textEditor_20250124: textEditorTool_20250124
};
function createAnthropic(options = {}) {
  var _a;
  const baseURL = (_a = withoutTrailingSlash(options.baseURL)) != null ? _a : "https://api.anthropic.com/v1";
  const getHeaders = () => ({
    "anthropic-version": "2023-06-01",
    "x-api-key": loadApiKey({
      apiKey: options.apiKey,
      description: "Anthropic",
      environmentVariableName: "ANTHROPIC_API_KEY"
    }),
    ...options.headers
  });
  const createChatModel = (modelId, settings = {}) => new AnthropicMessagesLanguageModel(modelId, settings, {
    baseURL,
    fetch: options.fetch,
    headers: getHeaders,
    provider: "anthropic.messages",
    supportsImageUrls: true
  });
  const provider = function(modelId, settings) {
    if (new.target) {
      throw new Error(
        "The Anthropic model function cannot be called with the new keyword."
      );
    }
    return createChatModel(modelId, settings);
  };
  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.messages = createChatModel;
  provider.textEmbeddingModel = (modelId) => {
    throw new NoSuchModelError({ modelId, modelType: "textEmbeddingModel" });
  };
  provider.tools = anthropicTools;
  return provider;
}
var anthropic = createAnthropic();

export { anthropic, createAnthropic };
