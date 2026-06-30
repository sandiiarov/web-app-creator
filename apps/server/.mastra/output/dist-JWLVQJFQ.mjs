import { w as withoutTrailingSlash, f as createJsonErrorResponseHandler, a as postJsonToApi, c as combineHeaders, b as createJsonResponseHandler, g as generateId, d as createEventSourceResponseHandler, I as InvalidResponseDataError, i as isParsableJson, l as loadApiKey, U as UnsupportedFunctionalityError, e as convertUint8ArrayToBase64, N as NoSuchModelError } from './dist-CB67HEFG.mjs';
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

function convertToOpenAICompatibleChatMessages(prompt) {
  const messages = [];
  for (const { content, role, ...message } of prompt) {
    const metadata = getOpenAIMetadata({ ...message });
    switch (role) {
      case "assistant": {
        let text = "";
        const toolCalls = [];
        for (const part of content) {
          const partMetadata = getOpenAIMetadata(part);
          switch (part.type) {
            case "text": {
              text += part.text;
              break;
            }
            case "tool-call": {
              toolCalls.push({
                function: {
                  arguments: JSON.stringify(part.args),
                  name: part.toolName
                },
                id: part.toolCallId,
                type: "function",
                ...partMetadata
              });
              break;
            }
          }
        }
        messages.push({
          content: text,
          role: "assistant",
          tool_calls: toolCalls.length > 0 ? toolCalls : void 0,
          ...metadata
        });
        break;
      }
      case "system": {
        messages.push({ content, role: "system", ...metadata });
        break;
      }
      case "tool": {
        for (const toolResponse of content) {
          const toolResponseMetadata = getOpenAIMetadata(toolResponse);
          messages.push({
            content: JSON.stringify(toolResponse.result),
            role: "tool",
            tool_call_id: toolResponse.toolCallId,
            ...toolResponseMetadata
          });
        }
        break;
      }
      case "user": {
        if (content.length === 1 && content[0].type === "text") {
          messages.push({
            content: content[0].text,
            role: "user",
            ...getOpenAIMetadata(content[0])
          });
          break;
        }
        messages.push({
          content: content.map((part) => {
            var _a;
            const partMetadata = getOpenAIMetadata(part);
            switch (part.type) {
              case "image": {
                return {
                  type: "image_url",
                  image_url: {
                    url: part.image instanceof URL ? part.image.toString() : `data:${(_a = part.mimeType) != null ? _a : "image/jpeg"};base64,${convertUint8ArrayToBase64(part.image)}`
                  },
                  ...partMetadata
                };
              }
              case "text": {
                return { type: "text", text: part.text, ...partMetadata };
              }
              case "file": {
                throw new UnsupportedFunctionalityError({
                  functionality: "File content parts in user messages"
                });
              }
            }
          }),
          role: "user",
          ...metadata
        });
        break;
      }
      default: {
        const _exhaustiveCheck = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }
  return messages;
}
function getOpenAIMetadata(message) {
  var _a, _b;
  return (_b = (_a = message == null ? void 0 : message.providerMetadata) == null ? void 0 : _a.openaiCompatible) != null ? _b : {};
}
function getResponseMetadata({
  created,
  id,
  model
}) {
  return {
    id: id != null ? id : void 0,
    modelId: model != null ? model : void 0,
    timestamp: created != null ? new Date(created * 1e3) : void 0
  };
}
function mapOpenAICompatibleFinishReason(finishReason) {
  switch (finishReason) {
    case "content_filter":
      return "content-filter";
    case "function_call":
    case "tool_calls":
      return "tool-calls";
    case "length":
      return "length";
    case "stop":
      return "stop";
    default:
      return "unknown";
  }
}
var openaiCompatibleErrorDataSchema = z.object({
  error: z.object({
    code: z.union([z.string(), z.number()]).nullish(),
    message: z.string(),
    param: z.any().nullish(),
    // The additional information below is handled loosely to support
    // OpenAI-compatible providers that have slightly different error
    // responses:
    type: z.string().nullish()
  })
});
var defaultOpenAICompatibleErrorStructure = {
  errorSchema: openaiCompatibleErrorDataSchema,
  errorToMessage: (data) => data.error.message
};
function prepareTools({
  mode,
  structuredOutputs
}) {
  var _a;
  const tools = ((_a = mode.tools) == null ? void 0 : _a.length) ? mode.tools : void 0;
  const toolWarnings = [];
  if (tools == null) {
    return { tool_choice: void 0, tools: void 0, toolWarnings };
  }
  const toolChoice = mode.toolChoice;
  const openaiCompatTools = [];
  for (const tool of tools) {
    if (tool.type === "provider-defined") {
      toolWarnings.push({ tool, type: "unsupported-tool" });
    } else {
      openaiCompatTools.push({
        function: {
          description: tool.description,
          name: tool.name,
          parameters: tool.parameters
        },
        type: "function"
      });
    }
  }
  if (toolChoice == null) {
    return { tool_choice: void 0, tools: openaiCompatTools, toolWarnings };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
    case "none":
    case "required":
      return { tool_choice: type, tools: openaiCompatTools, toolWarnings };
    case "tool":
      return {
        tool_choice: {
          function: {
            name: toolChoice.toolName
          },
          type: "function"
        },
        tools: openaiCompatTools,
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
var OpenAICompatibleChatLanguageModel = class {
  get defaultObjectGenerationMode() {
    return this.config.defaultObjectGenerationMode;
  }
  get provider() {
    return this.config.provider;
  }
  get providerOptionsName() {
    return this.config.provider.split(".")[0].trim();
  }
  // type inferred via constructor
  constructor(modelId, settings, config) {
    this.specificationVersion = "v1";
    var _a, _b;
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
    const errorStructure = (_a = config.errorStructure) != null ? _a : defaultOpenAICompatibleErrorStructure;
    this.chunkSchema = createOpenAICompatibleChatChunkSchema(
      errorStructure.errorSchema
    );
    this.failedResponseHandler = createJsonErrorResponseHandler(errorStructure);
    this.supportsStructuredOutputs = (_b = config.supportsStructuredOutputs) != null ? _b : false;
  }
  async doGenerate(options) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
    const { args, warnings } = this.getArgs({ ...options });
    const body = JSON.stringify(args);
    const {
      rawValue: rawResponse,
      responseHeaders,
      value: responseBody
    } = await postJsonToApi({
      abortSignal: options.abortSignal,
      body: args,
      failedResponseHandler: this.failedResponseHandler,
      fetch: this.config.fetch,
      headers: combineHeaders(this.config.headers(), options.headers),
      successfulResponseHandler: createJsonResponseHandler(
        OpenAICompatibleChatResponseSchema
      ),
      url: this.config.url({
        modelId: this.modelId,
        path: "/chat/completions"
      })
    });
    const { messages: rawPrompt, ...rawSettings } = args;
    const choice = responseBody.choices[0];
    const providerMetadata = {
      [this.providerOptionsName]: {},
      ...(_b = (_a = this.config.metadataExtractor) == null ? void 0 : _a.extractMetadata) == null ? void 0 : _b.call(_a, {
        parsedBody: rawResponse
      })
    };
    const completionTokenDetails = (_c = responseBody.usage) == null ? void 0 : _c.completion_tokens_details;
    const promptTokenDetails = (_d = responseBody.usage) == null ? void 0 : _d.prompt_tokens_details;
    if ((completionTokenDetails == null ? void 0 : completionTokenDetails.reasoning_tokens) != null) {
      providerMetadata[this.providerOptionsName].reasoningTokens = completionTokenDetails == null ? void 0 : completionTokenDetails.reasoning_tokens;
    }
    if ((completionTokenDetails == null ? void 0 : completionTokenDetails.accepted_prediction_tokens) != null) {
      providerMetadata[this.providerOptionsName].acceptedPredictionTokens = completionTokenDetails == null ? void 0 : completionTokenDetails.accepted_prediction_tokens;
    }
    if ((completionTokenDetails == null ? void 0 : completionTokenDetails.rejected_prediction_tokens) != null) {
      providerMetadata[this.providerOptionsName].rejectedPredictionTokens = completionTokenDetails == null ? void 0 : completionTokenDetails.rejected_prediction_tokens;
    }
    if ((promptTokenDetails == null ? void 0 : promptTokenDetails.cached_tokens) != null) {
      providerMetadata[this.providerOptionsName].cachedPromptTokens = promptTokenDetails == null ? void 0 : promptTokenDetails.cached_tokens;
    }
    return {
      finishReason: mapOpenAICompatibleFinishReason(choice.finish_reason),
      providerMetadata,
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { body: rawResponse, headers: responseHeaders },
      reasoning: (_f = choice.message.reasoning_content) != null ? _f : void 0,
      request: { body },
      response: getResponseMetadata(responseBody),
      text: (_e = choice.message.content) != null ? _e : void 0,
      toolCalls: (_g = choice.message.tool_calls) == null ? void 0 : _g.map((toolCall) => {
        var _a2;
        return {
          args: toolCall.function.arguments,
          toolCallId: (_a2 = toolCall.id) != null ? _a2 : generateId(),
          toolCallType: "function",
          toolName: toolCall.function.name
        };
      }),
      usage: {
        completionTokens: (_k = (_j = responseBody.usage) == null ? void 0 : _j.completion_tokens) != null ? _k : NaN,
        promptTokens: (_i = (_h = responseBody.usage) == null ? void 0 : _h.prompt_tokens) != null ? _i : NaN
      },
      warnings
    };
  }
  async doStream(options) {
    var _a;
    if (this.settings.simulateStreaming) {
      const result = await this.doGenerate(options);
      const simulatedStream = new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "response-metadata", ...result.response });
          if (result.reasoning) {
            if (Array.isArray(result.reasoning)) {
              for (const part of result.reasoning) {
                if (part.type === "text") {
                  controller.enqueue({
                    textDelta: part.text,
                    type: "reasoning"
                  });
                }
              }
            } else {
              controller.enqueue({
                textDelta: result.reasoning,
                type: "reasoning"
              });
            }
          }
          if (result.text) {
            controller.enqueue({
              textDelta: result.text,
              type: "text-delta"
            });
          }
          if (result.toolCalls) {
            for (const toolCall of result.toolCalls) {
              controller.enqueue({
                type: "tool-call",
                ...toolCall
              });
            }
          }
          controller.enqueue({
            finishReason: result.finishReason,
            logprobs: result.logprobs,
            providerMetadata: result.providerMetadata,
            type: "finish",
            usage: result.usage
          });
          controller.close();
        }
      });
      return {
        rawCall: result.rawCall,
        rawResponse: result.rawResponse,
        stream: simulatedStream,
        warnings: result.warnings
      };
    }
    const { args, warnings } = this.getArgs({ ...options });
    const body = {
      ...args,
      stream: true,
      // only include stream_options when in strict compatibility mode:
      stream_options: this.config.includeUsage ? { include_usage: true } : void 0
    };
    const metadataExtractor = (_a = this.config.metadataExtractor) == null ? void 0 : _a.createStreamExtractor();
    const { responseHeaders, value: response } = await postJsonToApi({
      abortSignal: options.abortSignal,
      body,
      failedResponseHandler: this.failedResponseHandler,
      fetch: this.config.fetch,
      headers: combineHeaders(this.config.headers(), options.headers),
      successfulResponseHandler: createEventSourceResponseHandler(
        this.chunkSchema
      ),
      url: this.config.url({
        modelId: this.modelId,
        path: "/chat/completions"
      })
    });
    const { messages: rawPrompt, ...rawSettings } = args;
    const toolCalls = [];
    let finishReason = "unknown";
    let usage = {
      completionTokens: void 0,
      completionTokensDetails: {
        acceptedPredictionTokens: void 0,
        reasoningTokens: void 0,
        rejectedPredictionTokens: void 0
      },
      promptTokens: void 0,
      promptTokensDetails: {
        cachedTokens: void 0
      }
    };
    let isFirstChunk = true;
    let providerOptionsName = this.providerOptionsName;
    return {
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      request: { body: JSON.stringify(body) },
      stream: response.pipeThrough(
        new TransformStream({
          flush(controller) {
            var _a2, _b;
            const providerMetadata = {
              [providerOptionsName]: {},
              ...metadataExtractor == null ? void 0 : metadataExtractor.buildMetadata()
            };
            if (usage.completionTokensDetails.reasoningTokens != null) {
              providerMetadata[providerOptionsName].reasoningTokens = usage.completionTokensDetails.reasoningTokens;
            }
            if (usage.completionTokensDetails.acceptedPredictionTokens != null) {
              providerMetadata[providerOptionsName].acceptedPredictionTokens = usage.completionTokensDetails.acceptedPredictionTokens;
            }
            if (usage.completionTokensDetails.rejectedPredictionTokens != null) {
              providerMetadata[providerOptionsName].rejectedPredictionTokens = usage.completionTokensDetails.rejectedPredictionTokens;
            }
            if (usage.promptTokensDetails.cachedTokens != null) {
              providerMetadata[providerOptionsName].cachedPromptTokens = usage.promptTokensDetails.cachedTokens;
            }
            controller.enqueue({
              finishReason,
              providerMetadata,
              type: "finish",
              usage: {
                promptTokens: (_a2 = usage.promptTokens) != null ? _a2 : NaN,
                completionTokens: (_b = usage.completionTokens) != null ? _b : NaN
              }
            });
          },
          // TODO we lost type safety on Chunk, most likely due to the error schema. MUST FIX
          transform(chunk, controller) {
            var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
            if (!chunk.success) {
              finishReason = "error";
              controller.enqueue({ error: chunk.error, type: "error" });
              return;
            }
            const value = chunk.value;
            metadataExtractor == null ? void 0 : metadataExtractor.processChunk(chunk.rawValue);
            if ("error" in value) {
              finishReason = "error";
              controller.enqueue({ error: value.error.message, type: "error" });
              return;
            }
            if (isFirstChunk) {
              isFirstChunk = false;
              controller.enqueue({
                type: "response-metadata",
                ...getResponseMetadata(value)
              });
            }
            if (value.usage != null) {
              const {
                completion_tokens,
                completion_tokens_details,
                prompt_tokens,
                prompt_tokens_details
              } = value.usage;
              usage.promptTokens = prompt_tokens != null ? prompt_tokens : void 0;
              usage.completionTokens = completion_tokens != null ? completion_tokens : void 0;
              if ((completion_tokens_details == null ? void 0 : completion_tokens_details.reasoning_tokens) != null) {
                usage.completionTokensDetails.reasoningTokens = completion_tokens_details == null ? void 0 : completion_tokens_details.reasoning_tokens;
              }
              if ((completion_tokens_details == null ? void 0 : completion_tokens_details.accepted_prediction_tokens) != null) {
                usage.completionTokensDetails.acceptedPredictionTokens = completion_tokens_details == null ? void 0 : completion_tokens_details.accepted_prediction_tokens;
              }
              if ((completion_tokens_details == null ? void 0 : completion_tokens_details.rejected_prediction_tokens) != null) {
                usage.completionTokensDetails.rejectedPredictionTokens = completion_tokens_details == null ? void 0 : completion_tokens_details.rejected_prediction_tokens;
              }
              if ((prompt_tokens_details == null ? void 0 : prompt_tokens_details.cached_tokens) != null) {
                usage.promptTokensDetails.cachedTokens = prompt_tokens_details == null ? void 0 : prompt_tokens_details.cached_tokens;
              }
            }
            const choice = value.choices[0];
            if ((choice == null ? void 0 : choice.finish_reason) != null) {
              finishReason = mapOpenAICompatibleFinishReason(
                choice.finish_reason
              );
            }
            if ((choice == null ? void 0 : choice.delta) == null) {
              return;
            }
            const delta = choice.delta;
            if (delta.reasoning_content != null) {
              controller.enqueue({
                textDelta: delta.reasoning_content,
                type: "reasoning"
              });
            }
            if (delta.content != null) {
              controller.enqueue({
                textDelta: delta.content,
                type: "text-delta"
              });
            }
            if (delta.tool_calls != null) {
              for (const toolCallDelta of delta.tool_calls) {
                const index = toolCallDelta.index;
                if (toolCalls[index] == null) {
                  if (toolCallDelta.type !== "function") {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function' type.`
                    });
                  }
                  if (toolCallDelta.id == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'id' to be a string.`
                    });
                  }
                  if (((_a2 = toolCallDelta.function) == null ? void 0 : _a2.name) == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function.name' to be a string.`
                    });
                  }
                  toolCalls[index] = {
                    function: {
                      name: toolCallDelta.function.name,
                      arguments: (_b = toolCallDelta.function.arguments) != null ? _b : ""
                    },
                    hasFinished: false,
                    id: toolCallDelta.id,
                    type: "function"
                  };
                  const toolCall2 = toolCalls[index];
                  if (((_c = toolCall2.function) == null ? void 0 : _c.name) != null && ((_d = toolCall2.function) == null ? void 0 : _d.arguments) != null) {
                    if (toolCall2.function.arguments.length > 0) {
                      controller.enqueue({
                        argsTextDelta: toolCall2.function.arguments,
                        toolCallId: toolCall2.id,
                        toolCallType: "function",
                        toolName: toolCall2.function.name,
                        type: "tool-call-delta"
                      });
                    }
                    if (isParsableJson(toolCall2.function.arguments)) {
                      controller.enqueue({
                        args: toolCall2.function.arguments,
                        toolCallId: (_e = toolCall2.id) != null ? _e : generateId(),
                        toolCallType: "function",
                        toolName: toolCall2.function.name,
                        type: "tool-call"
                      });
                      toolCall2.hasFinished = true;
                    }
                  }
                  continue;
                }
                const toolCall = toolCalls[index];
                if (toolCall.hasFinished) {
                  continue;
                }
                if (((_f = toolCallDelta.function) == null ? void 0 : _f.arguments) != null) {
                  toolCall.function.arguments += (_h = (_g = toolCallDelta.function) == null ? void 0 : _g.arguments) != null ? _h : "";
                }
                controller.enqueue({
                  argsTextDelta: (_i = toolCallDelta.function.arguments) != null ? _i : "",
                  toolCallId: toolCall.id,
                  toolCallType: "function",
                  toolName: toolCall.function.name,
                  type: "tool-call-delta"
                });
                if (((_j = toolCall.function) == null ? void 0 : _j.name) != null && ((_k = toolCall.function) == null ? void 0 : _k.arguments) != null && isParsableJson(toolCall.function.arguments)) {
                  controller.enqueue({
                    args: toolCall.function.arguments,
                    toolCallId: (_l = toolCall.id) != null ? _l : generateId(),
                    toolCallType: "function",
                    toolName: toolCall.function.name,
                    type: "tool-call"
                  });
                  toolCall.hasFinished = true;
                }
              }
            }
          }
        })
      ),
      warnings
    };
  }
  getArgs({
    frequencyPenalty,
    maxTokens,
    mode,
    presencePenalty,
    prompt,
    providerMetadata,
    responseFormat,
    seed,
    stopSequences,
    temperature,
    topK,
    topP
  }) {
    var _a, _b, _c, _d, _e;
    const type = mode.type;
    const warnings = [];
    if (topK != null) {
      warnings.push({
        setting: "topK",
        type: "unsupported-setting"
      });
    }
    if ((responseFormat == null ? void 0 : responseFormat.type) === "json" && responseFormat.schema != null && !this.supportsStructuredOutputs) {
      warnings.push({
        details: "JSON response format schema is only supported with structuredOutputs",
        setting: "responseFormat",
        type: "unsupported-setting"
      });
    }
    const baseArgs = {
      frequency_penalty: frequencyPenalty,
      // standardized settings:
      max_tokens: maxTokens,
      // model id:
      model: this.modelId,
      presence_penalty: presencePenalty,
      response_format: (responseFormat == null ? void 0 : responseFormat.type) === "json" ? this.supportsStructuredOutputs === true && responseFormat.schema != null ? {
        json_schema: {
          description: responseFormat.description,
          name: (_a = responseFormat.name) != null ? _a : "response",
          schema: responseFormat.schema
        },
        type: "json_schema"
      } : { type: "json_object" } : void 0,
      seed,
      stop: stopSequences,
      temperature,
      top_p: topP,
      // model specific settings:
      user: this.settings.user,
      ...providerMetadata == null ? void 0 : providerMetadata[this.providerOptionsName],
      // messages:
      messages: convertToOpenAICompatibleChatMessages(prompt),
      reasoning_effort: (_d = (_b = providerMetadata == null ? void 0 : providerMetadata[this.providerOptionsName]) == null ? void 0 : _b.reasoningEffort) != null ? _d : (_c = providerMetadata == null ? void 0 : providerMetadata["openai-compatible"]) == null ? void 0 : _c.reasoningEffort
    };
    switch (type) {
      case "object-json": {
        return {
          args: {
            ...baseArgs,
            response_format: this.supportsStructuredOutputs === true && mode.schema != null ? {
              json_schema: {
                description: mode.description,
                name: (_e = mode.name) != null ? _e : "response",
                schema: mode.schema
              },
              type: "json_schema"
            } : { type: "json_object" }
          },
          warnings
        };
      }
      case "object-tool": {
        return {
          args: {
            ...baseArgs,
            tool_choice: {
              function: { name: mode.tool.name },
              type: "function"
            },
            tools: [
              {
                function: {
                  description: mode.tool.description,
                  name: mode.tool.name,
                  parameters: mode.tool.parameters
                },
                type: "function"
              }
            ]
          },
          warnings
        };
      }
      case "regular": {
        const { tool_choice, tools, toolWarnings } = prepareTools({
          mode,
          structuredOutputs: this.supportsStructuredOutputs
        });
        return {
          args: { ...baseArgs, tool_choice, tools },
          warnings: [...warnings, ...toolWarnings]
        };
      }
      default: {
        const _exhaustiveCheck = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }
};
var openaiCompatibleTokenUsageSchema = z.object({
  completion_tokens: z.number().nullish(),
  completion_tokens_details: z.object({
    accepted_prediction_tokens: z.number().nullish(),
    reasoning_tokens: z.number().nullish(),
    rejected_prediction_tokens: z.number().nullish()
  }).nullish(),
  prompt_tokens: z.number().nullish(),
  prompt_tokens_details: z.object({
    cached_tokens: z.number().nullish()
  }).nullish()
}).nullish();
var OpenAICompatibleChatResponseSchema = z.object({
  choices: z.array(
    z.object({
      finish_reason: z.string().nullish(),
      message: z.object({
        content: z.string().nullish(),
        reasoning_content: z.string().nullish(),
        role: z.literal("assistant").nullish(),
        tool_calls: z.array(
          z.object({
            function: z.object({
              arguments: z.string(),
              name: z.string()
            }),
            id: z.string().nullish(),
            type: z.literal("function")
          })
        ).nullish()
      })
    })
  ),
  created: z.number().nullish(),
  id: z.string().nullish(),
  model: z.string().nullish(),
  usage: openaiCompatibleTokenUsageSchema
});
var createOpenAICompatibleChatChunkSchema = (errorSchema) => z.union([
  z.object({
    choices: z.array(
      z.object({
        delta: z.object({
          content: z.string().nullish(),
          reasoning_content: z.string().nullish(),
          role: z.enum(["assistant"]).nullish(),
          tool_calls: z.array(
            z.object({
              function: z.object({
                arguments: z.string().nullish(),
                name: z.string().nullish()
              }),
              id: z.string().nullish(),
              index: z.number().optional(),
              type: z.literal("function").nullish()
            })
          ).nullish()
        }).nullish(),
        finish_reason: z.string().nullish()
      })
    ),
    created: z.number().nullish(),
    id: z.string().nullish(),
    model: z.string().nullish(),
    usage: openaiCompatibleTokenUsageSchema
  }),
  errorSchema
]);
z.object({
  choices: z.array(
    z.object({
      finish_reason: z.string(),
      text: z.string()
    })
  ),
  created: z.number().nullish(),
  id: z.string().nullish(),
  model: z.string().nullish(),
  usage: z.object({
    completion_tokens: z.number(),
    prompt_tokens: z.number()
  }).nullish()
});
z.object({
  data: z.array(z.object({ embedding: z.array(z.number()) })),
  usage: z.object({ prompt_tokens: z.number() }).nullish()
});
var OpenAICompatibleImageModel = class {
  get maxImagesPerCall() {
    var _a;
    return (_a = this.settings.maxImagesPerCall) != null ? _a : 10;
  }
  get provider() {
    return this.config.provider;
  }
  constructor(modelId, settings, config) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
    this.specificationVersion = "v1";
  }
  async doGenerate({
    abortSignal,
    aspectRatio,
    headers,
    n,
    prompt,
    providerOptions,
    seed,
    size
  }) {
    var _a, _b, _c, _d, _e;
    const warnings = [];
    if (aspectRatio != null) {
      warnings.push({
        details: "This model does not support aspect ratio. Use `size` instead.",
        setting: "aspectRatio",
        type: "unsupported-setting"
      });
    }
    if (seed != null) {
      warnings.push({ setting: "seed", type: "unsupported-setting" });
    }
    const currentDate = (_c = (_b = (_a = this.config._internal) == null ? void 0 : _a.currentDate) == null ? void 0 : _b.call(_a)) != null ? _c : /* @__PURE__ */ new Date();
    const { responseHeaders, value: response } = await postJsonToApi({
      abortSignal,
      body: {
        model: this.modelId,
        n,
        prompt,
        size,
        ...(_d = providerOptions.openai) != null ? _d : {},
        response_format: "b64_json",
        ...this.settings.user ? { user: this.settings.user } : {}
      },
      failedResponseHandler: createJsonErrorResponseHandler(
        (_e = this.config.errorStructure) != null ? _e : defaultOpenAICompatibleErrorStructure
      ),
      fetch: this.config.fetch,
      headers: combineHeaders(this.config.headers(), headers),
      successfulResponseHandler: createJsonResponseHandler(
        openaiCompatibleImageResponseSchema
      ),
      url: this.config.url({
        modelId: this.modelId,
        path: "/images/generations"
      })
    });
    return {
      images: response.data.map((item) => item.b64_json),
      response: {
        headers: responseHeaders,
        modelId: this.modelId,
        timestamp: currentDate
      },
      warnings
    };
  }
};
var openaiCompatibleImageResponseSchema = z.object({
  data: z.array(z.object({ b64_json: z.string() }))
});
function supportsStructuredOutputs(modelId) {
  return [
    "grok-2-1212",
    "grok-2-vision-1212",
    "grok-3",
    "grok-3-beta",
    "grok-3-fast",
    "grok-3-fast-beta",
    "grok-3-fast-latest",
    "grok-3-latest",
    "grok-3-mini",
    "grok-3-mini-beta",
    "grok-3-mini-fast",
    "grok-3-mini-fast-beta",
    "grok-3-mini-fast-latest",
    "grok-3-mini-latest"
  ].includes(modelId);
}
var xaiErrorSchema = z.object({
  code: z.string(),
  error: z.string()
});
var xaiErrorStructure = {
  errorSchema: xaiErrorSchema,
  errorToMessage: (data) => data.error
};
function createXai(options = {}) {
  var _a;
  const baseURL = withoutTrailingSlash(
    (_a = options.baseURL) != null ? _a : "https://api.x.ai/v1"
  );
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      description: "xAI API key",
      environmentVariableName: "XAI_API_KEY"
    })}`,
    ...options.headers
  });
  const createLanguageModel = (modelId, settings = {}) => {
    const structuredOutputs = supportsStructuredOutputs(modelId);
    return new OpenAICompatibleChatLanguageModel(modelId, settings, {
      defaultObjectGenerationMode: structuredOutputs ? "json" : "tool",
      errorStructure: xaiErrorStructure,
      fetch: options.fetch,
      headers: getHeaders,
      includeUsage: true,
      provider: "xai.chat",
      supportsStructuredOutputs: structuredOutputs,
      url: ({ path }) => `${baseURL}${path}`
    });
  };
  const createImageModel = (modelId, settings = {}) => {
    return new OpenAICompatibleImageModel(modelId, settings, {
      errorStructure: xaiErrorStructure,
      fetch: options.fetch,
      headers: getHeaders,
      provider: "xai.image",
      url: ({ path }) => `${baseURL}${path}`
    });
  };
  const provider = (modelId, settings) => createLanguageModel(modelId, settings);
  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;
  provider.textEmbeddingModel = (modelId) => {
    throw new NoSuchModelError({ modelId, modelType: "textEmbeddingModel" });
  };
  provider.imageModel = createImageModel;
  provider.image = createImageModel;
  return provider;
}
var xai = createXai();

export { createXai, xai };
