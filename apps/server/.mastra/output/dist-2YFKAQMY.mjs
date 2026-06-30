import { w as withoutTrailingSlash, p as parseProviderOptions, a as postJsonToApi, c as combineHeaders, b as createJsonResponseHandler, g as generateId, d as createEventSourceResponseHandler, I as InvalidResponseDataError, i as isParsableJson, l as loadApiKey, U as UnsupportedFunctionalityError, e as convertUint8ArrayToBase64, f as createJsonErrorResponseHandler, N as NoSuchModelError, h as convertBase64ToUint8Array, j as postFormDataToApi } from './dist-CB67HEFG.mjs';
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

function convertToGroqChatMessages(prompt) {
  const messages = [];
  for (const { content, role } of prompt) {
    switch (role) {
      case "assistant": {
        let text = "";
        const toolCalls = [];
        for (const part of content) {
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
                type: "function"
              });
              break;
            }
          }
        }
        messages.push({
          content: text,
          role: "assistant",
          tool_calls: toolCalls.length > 0 ? toolCalls : void 0
        });
        break;
      }
      case "system": {
        messages.push({ content, role: "system" });
        break;
      }
      case "tool": {
        for (const toolResponse of content) {
          messages.push({
            content: JSON.stringify(toolResponse.result),
            role: "tool",
            tool_call_id: toolResponse.toolCallId
          });
        }
        break;
      }
      case "user": {
        if (content.length === 1 && content[0].type === "text") {
          messages.push({ content: content[0].text, role: "user" });
          break;
        }
        messages.push({
          content: content.map((part) => {
            var _a;
            switch (part.type) {
              case "image": {
                return {
                  image_url: {
                    url: part.image instanceof URL ? part.image.toString() : `data:${(_a = part.mimeType) != null ? _a : "image/jpeg"};base64,${convertUint8ArrayToBase64(part.image)}`
                  },
                  type: "image_url"
                };
              }
              case "text": {
                return { text: part.text, type: "text" };
              }
              case "file": {
                throw new UnsupportedFunctionalityError({
                  functionality: "File content parts in user messages"
                });
              }
            }
          }),
          role: "user"
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
var groqErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string()
  })
});
var groqFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: groqErrorDataSchema,
  errorToMessage: (data) => data.error.message
});
function mapGroqFinishReason(finishReason) {
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
function prepareTools({
  mode
}) {
  var _a;
  const tools = ((_a = mode.tools) == null ? void 0 : _a.length) ? mode.tools : void 0;
  const toolWarnings = [];
  if (tools == null) {
    return { tool_choice: void 0, tools: void 0, toolWarnings };
  }
  const toolChoice = mode.toolChoice;
  const groqTools = [];
  for (const tool of tools) {
    if (tool.type === "provider-defined") {
      toolWarnings.push({ tool, type: "unsupported-tool" });
    } else {
      groqTools.push({
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
    return { tool_choice: void 0, tools: groqTools, toolWarnings };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
    case "none":
    case "required":
      return { tool_choice: type, tools: groqTools, toolWarnings };
    case "tool":
      return {
        tool_choice: {
          function: {
            name: toolChoice.toolName
          },
          type: "function"
        },
        tools: groqTools,
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
var GroqChatLanguageModel = class {
  get provider() {
    return this.config.provider;
  }
  get supportsImageUrls() {
    return !this.settings.downloadImages;
  }
  constructor(modelId, settings, config) {
    this.specificationVersion = "v1";
    this.supportsStructuredOutputs = false;
    this.defaultObjectGenerationMode = "json";
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }
  async doGenerate(options) {
    var _a, _b, _c, _d, _e, _f, _g;
    const { args, warnings } = this.getArgs({ ...options, stream: false });
    const body = JSON.stringify(args);
    const {
      rawValue: rawResponse,
      responseHeaders,
      value: response
    } = await postJsonToApi({
      abortSignal: options.abortSignal,
      body: args,
      failedResponseHandler: groqFailedResponseHandler,
      fetch: this.config.fetch,
      headers: combineHeaders(this.config.headers(), options.headers),
      successfulResponseHandler: createJsonResponseHandler(
        groqChatResponseSchema
      ),
      url: this.config.url({
        modelId: this.modelId,
        path: "/chat/completions"
      })
    });
    const { messages: rawPrompt, ...rawSettings } = args;
    const choice = response.choices[0];
    return {
      finishReason: mapGroqFinishReason(choice.finish_reason),
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { body: rawResponse, headers: responseHeaders },
      reasoning: (_b = choice.message.reasoning) != null ? _b : void 0,
      request: { body },
      response: getResponseMetadata(response),
      text: (_a = choice.message.content) != null ? _a : void 0,
      toolCalls: (_c = choice.message.tool_calls) == null ? void 0 : _c.map((toolCall) => {
        var _a2;
        return {
          args: toolCall.function.arguments,
          toolCallId: (_a2 = toolCall.id) != null ? _a2 : generateId(),
          toolCallType: "function",
          toolName: toolCall.function.name
        };
      }),
      usage: {
        completionTokens: (_g = (_f = response.usage) == null ? void 0 : _f.completion_tokens) != null ? _g : NaN,
        promptTokens: (_e = (_d = response.usage) == null ? void 0 : _d.prompt_tokens) != null ? _e : NaN
      },
      warnings
    };
  }
  async doStream(options) {
    const { args, warnings } = this.getArgs({ ...options, stream: true });
    const body = JSON.stringify({ ...args, stream: true });
    const { responseHeaders, value: response } = await postJsonToApi({
      abortSignal: options.abortSignal,
      body: {
        ...args,
        stream: true
      },
      failedResponseHandler: groqFailedResponseHandler,
      fetch: this.config.fetch,
      headers: combineHeaders(this.config.headers(), options.headers),
      successfulResponseHandler: createEventSourceResponseHandler(groqChatChunkSchema),
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
      promptTokens: void 0
    };
    let isFirstChunk = true;
    return {
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      request: { body },
      stream: response.pipeThrough(
        new TransformStream({
          flush(controller) {
            var _a, _b;
            controller.enqueue(({
	type: 'finish',
	finishReason,
	usage: {
		promptTokens: (_a = usage.promptTokens) != null ? _a : NaN,
		completionTokens: (_b = usage.completionTokens) != null ? _b : NaN
	}
}));
          },
          transform(chunk, controller) {
            var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o;
            if (!chunk.success) {
              finishReason = "error";
              controller.enqueue({ error: chunk.error, type: "error" });
              return;
            }
            const value = chunk.value;
            if ("error" in value) {
              finishReason = "error";
              controller.enqueue({ error: value.error, type: "error" });
              return;
            }
            if (isFirstChunk) {
              isFirstChunk = false;
              controller.enqueue({
                type: "response-metadata",
                ...getResponseMetadata(value)
              });
            }
            if (((_a = value.x_groq) == null ? void 0 : _a.usage) != null) {
              usage = {
                completionTokens: (_c = value.x_groq.usage.completion_tokens) != null ? _c : void 0,
                promptTokens: (_b = value.x_groq.usage.prompt_tokens) != null ? _b : void 0
              };
            }
            const choice = value.choices[0];
            if ((choice == null ? void 0 : choice.finish_reason) != null) {
              finishReason = mapGroqFinishReason(choice.finish_reason);
            }
            if ((choice == null ? void 0 : choice.delta) == null) {
              return;
            }
            const delta = choice.delta;
            if (delta.reasoning != null && delta.reasoning.length > 0) {
              controller.enqueue({
                textDelta: delta.reasoning,
                type: "reasoning"
              });
            }
            if (delta.content != null && delta.content.length > 0) {
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
                  if (((_d = toolCallDelta.function) == null ? void 0 : _d.name) == null) {
                    throw new InvalidResponseDataError({
                      data: toolCallDelta,
                      message: `Expected 'function.name' to be a string.`
                    });
                  }
                  toolCalls[index] = {
                    function: {
                      name: toolCallDelta.function.name,
                      arguments: (_e = toolCallDelta.function.arguments) != null ? _e : ""
                    },
                    hasFinished: false,
                    id: toolCallDelta.id,
                    type: "function"
                  };
                  const toolCall2 = toolCalls[index];
                  if (((_f = toolCall2.function) == null ? void 0 : _f.name) != null && ((_g = toolCall2.function) == null ? void 0 : _g.arguments) != null) {
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
                        toolCallId: (_h = toolCall2.id) != null ? _h : generateId(),
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
                if (((_i = toolCallDelta.function) == null ? void 0 : _i.arguments) != null) {
                  toolCall.function.arguments += (_k = (_j = toolCallDelta.function) == null ? void 0 : _j.arguments) != null ? _k : "";
                }
                controller.enqueue({
                  argsTextDelta: (_l = toolCallDelta.function.arguments) != null ? _l : "",
                  toolCallId: toolCall.id,
                  toolCallType: "function",
                  toolName: toolCall.function.name,
                  type: "tool-call-delta"
                });
                if (((_m = toolCall.function) == null ? void 0 : _m.name) != null && ((_n = toolCall.function) == null ? void 0 : _n.arguments) != null && isParsableJson(toolCall.function.arguments)) {
                  controller.enqueue({
                    args: toolCall.function.arguments,
                    toolCallId: (_o = toolCall.id) != null ? _o : generateId(),
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
    stream,
    temperature,
    topK,
    topP
  }) {
    const type = mode.type;
    const warnings = [];
    if (topK != null) {
      warnings.push({
        setting: "topK",
        type: "unsupported-setting"
      });
    }
    if (responseFormat != null && responseFormat.type === "json" && responseFormat.schema != null) {
      warnings.push({
        details: "JSON response format schema is not supported",
        setting: "responseFormat",
        type: "unsupported-setting"
      });
    }
    const groqOptions = parseProviderOptions({
      provider: "groq",
      providerOptions: providerMetadata,
      schema: z.object({
        reasoningFormat: z.enum(["parsed", "raw", "hidden"]).nullish()
      })
    });
    const baseArgs = {
      frequency_penalty: frequencyPenalty,
      // standardized settings:
      max_tokens: maxTokens,
      // messages:
      messages: convertToGroqChatMessages(prompt),
      // model id:
      model: this.modelId,
      parallel_tool_calls: this.settings.parallelToolCalls,
      presence_penalty: presencePenalty,
      // provider options:
      reasoning_format: groqOptions == null ? void 0 : groqOptions.reasoningFormat,
      // response format:
      response_format: (
        // json object response format is not supported for streaming:
        stream === false && (responseFormat == null ? void 0 : responseFormat.type) === "json" ? { type: "json_object" } : void 0
      ),
      seed,
      stop: stopSequences,
      temperature,
      top_p: topP,
      // model specific settings:
      user: this.settings.user
    };
    switch (type) {
      case "object-json": {
        return {
          args: {
            ...baseArgs,
            response_format: (
              // json object response format is not supported for streaming:
              stream === false ? { type: "json_object" } : void 0
            )
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
        const { tool_choice, tools, toolWarnings } = prepareTools({ mode });
        return {
          args: {
            ...baseArgs,
            tool_choice,
            tools
          },
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
var groqChatResponseSchema = z.object({
  choices: z.array(
    z.object({
      finish_reason: z.string().nullish(),
      index: z.number(),
      message: z.object({
        content: z.string().nullish(),
        reasoning: z.string().nullish(),
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
  usage: z.object({
    completion_tokens: z.number().nullish(),
    prompt_tokens: z.number().nullish()
  }).nullish()
});
var groqChatChunkSchema = z.union([
  z.object({
    choices: z.array(
      z.object({
        delta: z.object({
          content: z.string().nullish(),
          reasoning: z.string().nullish(),
          tool_calls: z.array(
            z.object({
              function: z.object({
                arguments: z.string().nullish(),
                name: z.string().nullish()
              }),
              id: z.string().nullish(),
              index: z.number(),
              type: z.literal("function").optional()
            })
          ).nullish()
        }).nullish(),
        finish_reason: z.string().nullable().optional(),
        index: z.number()
      })
    ),
    created: z.number().nullish(),
    id: z.string().nullish(),
    model: z.string().nullish(),
    x_groq: z.object({
      usage: z.object({
        completion_tokens: z.number().nullish(),
        prompt_tokens: z.number().nullish()
      }).nullish()
    }).nullish()
  }),
  groqErrorDataSchema
]);
var groqProviderOptionsSchema = z.object({
  language: z.string().nullish(),
  prompt: z.string().nullish(),
  responseFormat: z.string().nullish(),
  temperature: z.number().min(0).max(1).nullish(),
  timestampGranularities: z.array(z.string()).nullish()
});
var GroqTranscriptionModel = class {
  get provider() {
    return this.config.provider;
  }
  constructor(modelId, config) {
    this.modelId = modelId;
    this.config = config;
    this.specificationVersion = "v1";
  }
  async doGenerate(options) {
    var _a, _b, _c, _d, _e;
    const currentDate = (_c = (_b = (_a = this.config._internal) == null ? void 0 : _a.currentDate) == null ? void 0 : _b.call(_a)) != null ? _c : /* @__PURE__ */ new Date();
    const { formData, warnings } = this.getArgs(options);
    const {
      rawValue: rawResponse,
      responseHeaders,
      value: response
    } = await postFormDataToApi({
      abortSignal: options.abortSignal,
      failedResponseHandler: groqFailedResponseHandler,
      fetch: this.config.fetch,
      formData,
      headers: combineHeaders(this.config.headers(), options.headers),
      successfulResponseHandler: createJsonResponseHandler(
        groqTranscriptionResponseSchema
      ),
      url: this.config.url({
        modelId: this.modelId,
        path: "/audio/transcriptions"
      })
    });
    return {
      durationInSeconds: response.duration,
      language: response.language,
      response: {
        body: rawResponse,
        headers: responseHeaders,
        modelId: this.modelId,
        timestamp: currentDate
      },
      segments: (_e = (_d = response.segments) == null ? void 0 : _d.map((segment) => ({
        endSecond: segment.end,
        startSecond: segment.start,
        text: segment.text
      }))) != null ? _e : [],
      text: response.text,
      warnings
    };
  }
  getArgs({
    audio,
    mediaType,
    providerOptions
  }) {
    var _a, _b, _c, _d, _e;
    const warnings = [];
    const groqOptions = parseProviderOptions({
      provider: "groq",
      providerOptions,
      schema: groqProviderOptionsSchema
    });
    const formData = new FormData();
    const blob = audio instanceof Uint8Array ? new Blob([audio]) : new Blob([convertBase64ToUint8Array(audio)]);
    formData.append("model", this.modelId);
    formData.append("file", new File([blob], "audio", { type: mediaType }));
    if (groqOptions) {
      const transcriptionModelOptions = {
        language: (_a = groqOptions.language) != null ? _a : void 0,
        prompt: (_b = groqOptions.prompt) != null ? _b : void 0,
        response_format: (_c = groqOptions.responseFormat) != null ? _c : void 0,
        temperature: (_d = groqOptions.temperature) != null ? _d : void 0,
        timestamp_granularities: (_e = groqOptions.timestampGranularities) != null ? _e : void 0
      };
      for (const key in transcriptionModelOptions) {
        const value = transcriptionModelOptions[key];
        if (value !== void 0) {
          formData.append(key, String(value));
        }
      }
    }
    return {
      formData,
      warnings
    };
  }
};
var groqTranscriptionResponseSchema = z.object({
  duration: z.number(),
  language: z.string(),
  segments: z.array(
    z.object({
      avg_logprob: z.number(),
      compression_ratio: z.number(),
      end: z.number(),
      id: z.number(),
      no_speech_prob: z.number(),
      seek: z.number(),
      start: z.number(),
      temperature: z.number(),
      text: z.string(),
      tokens: z.array(z.number())
    })
  ),
  task: z.string(),
  text: z.string(),
  x_groq: z.object({
    id: z.string()
  })
});
function createGroq(options = {}) {
  var _a;
  const baseURL = (_a = withoutTrailingSlash(options.baseURL)) != null ? _a : "https://api.groq.com/openai/v1";
  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      description: "Groq",
      environmentVariableName: "GROQ_API_KEY"
    })}`,
    ...options.headers
  });
  const createChatModel = (modelId, settings = {}) => new GroqChatLanguageModel(modelId, settings, {
    fetch: options.fetch,
    headers: getHeaders,
    provider: "groq.chat",
    url: ({ path }) => `${baseURL}${path}`
  });
  const createLanguageModel = (modelId, settings) => {
    if (new.target) {
      throw new Error(
        "The Groq model function cannot be called with the new keyword."
      );
    }
    return createChatModel(modelId, settings);
  };
  const createTranscriptionModel = (modelId) => {
    return new GroqTranscriptionModel(modelId, {
      fetch: options.fetch,
      headers: getHeaders,
      provider: "groq.transcription",
      url: ({ path }) => `${baseURL}${path}`
    });
  };
  const provider = function(modelId, settings) {
    return createLanguageModel(modelId, settings);
  };
  provider.languageModel = createLanguageModel;
  provider.chat = createChatModel;
  provider.textEmbeddingModel = (modelId) => {
    throw new NoSuchModelError({ modelId, modelType: "textEmbeddingModel" });
  };
  provider.transcription = createTranscriptionModel;
  return provider;
}
var groq = createGroq();

export { createGroq, groq };
