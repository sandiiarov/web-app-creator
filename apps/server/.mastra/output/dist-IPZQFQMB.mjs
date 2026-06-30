import { w as withoutTrailingSlash, g as generateId, p as parseProviderOptions, c as combineHeaders, r as resolve, a as postJsonToApi, b as createJsonResponseHandler, d as createEventSourceResponseHandler, l as loadApiKey, U as UnsupportedFunctionalityError, e as convertUint8ArrayToBase64, f as createJsonErrorResponseHandler, T as TooManyEmbeddingValuesForCallError } from './dist-CB67HEFG.mjs';
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

function convertJSONSchemaToOpenAPISchema(jsonSchema) {
  if (isEmptyObjectSchema(jsonSchema)) {
    return void 0;
  }
  if (typeof jsonSchema === "boolean") {
    return { properties: {}, type: "boolean" };
  }
  const {
    allOf,
    anyOf,
    const: constValue,
    description,
    enum: enumValues,
    format,
    items,
    minLength,
    oneOf,
    properties,
    required,
    type
  } = jsonSchema;
  const result = {};
  if (description)
    result.description = description;
  if (required)
    result.required = required;
  if (format)
    result.format = format;
  if (constValue !== void 0) {
    result.enum = [constValue];
  }
  if (type) {
    if (Array.isArray(type)) {
      if (type.includes("null")) {
        result.type = type.filter((t) => t !== "null")[0];
        result.nullable = true;
      } else {
        result.type = type;
      }
    } else if (type === "null") {
      result.type = "null";
    } else {
      result.type = type;
    }
  }
  if (enumValues !== void 0) {
    result.enum = enumValues;
  }
  if (properties != null) {
    result.properties = Object.entries(properties).reduce(
      (acc, [key, value]) => {
        acc[key] = convertJSONSchemaToOpenAPISchema(value);
        return acc;
      },
      {}
    );
  }
  if (items) {
    result.items = Array.isArray(items) ? items.map(convertJSONSchemaToOpenAPISchema) : convertJSONSchemaToOpenAPISchema(items);
  }
  if (allOf) {
    result.allOf = allOf.map(convertJSONSchemaToOpenAPISchema);
  }
  if (anyOf) {
    if (anyOf.some(
      (schema) => typeof schema === "object" && (schema == null ? void 0 : schema.type) === "null"
    )) {
      const nonNullSchemas = anyOf.filter(
        (schema) => !(typeof schema === "object" && (schema == null ? void 0 : schema.type) === "null")
      );
      if (nonNullSchemas.length === 1) {
        const converted = convertJSONSchemaToOpenAPISchema(nonNullSchemas[0]);
        if (typeof converted === "object") {
          result.nullable = true;
          Object.assign(result, converted);
        }
      } else {
        result.anyOf = nonNullSchemas.map(convertJSONSchemaToOpenAPISchema);
        result.nullable = true;
      }
    } else {
      result.anyOf = anyOf.map(convertJSONSchemaToOpenAPISchema);
    }
  }
  if (oneOf) {
    result.oneOf = oneOf.map(convertJSONSchemaToOpenAPISchema);
  }
  if (minLength !== void 0) {
    result.minLength = minLength;
  }
  return result;
}
function convertToGoogleGenerativeAIMessages(prompt) {
  var _a, _b;
  const systemInstructionParts = [];
  const contents = [];
  let systemMessagesAllowed = true;
  for (const { content, role } of prompt) {
    switch (role) {
      case "assistant": {
        systemMessagesAllowed = false;
        contents.push({
          parts: content.map((part) => {
            switch (part.type) {
              case "file": {
                if (part.mimeType !== "image/png") {
                  throw new UnsupportedFunctionalityError({
                    functionality: "Only PNG images are supported in assistant messages"
                  });
                }
                if (part.data instanceof URL) {
                  throw new UnsupportedFunctionalityError({
                    functionality: "File data URLs in assistant messages are not supported"
                  });
                }
                return {
                  inlineData: {
                    mimeType: part.mimeType,
                    data: part.data
                  }
                };
              }
              case "text": {
                return part.text.length === 0 ? void 0 : { text: part.text };
              }
              case "tool-call": {
                return {
                  functionCall: {
                    args: part.args,
                    name: part.toolName
                  }
                };
              }
            }
          }).filter((part) => part !== void 0),
          role: "model"
        });
        break;
      }
      case "system": {
        if (!systemMessagesAllowed) {
          throw new UnsupportedFunctionalityError({
            functionality: "system messages are only supported at the beginning of the conversation"
          });
        }
        systemInstructionParts.push({ text: content });
        break;
      }
      case "tool": {
        systemMessagesAllowed = false;
        contents.push({
          parts: content.map((part) => ({
            functionResponse: {
              name: part.toolName,
              response: {
                content: part.result,
                name: part.toolName
              }
            }
          })),
          role: "user"
        });
        break;
      }
      case "user": {
        systemMessagesAllowed = false;
        const parts = [];
        for (const part of content) {
          switch (part.type) {
            case "file": {
              parts.push(
                part.data instanceof URL ? {
                  fileData: {
                    fileUri: part.data.toString(),
                    mimeType: part.mimeType
                  }
                } : {
                  inlineData: {
                    data: part.data,
                    mimeType: part.mimeType
                  }
                }
              );
              break;
            }
            case "image": {
              parts.push(
                part.image instanceof URL ? {
                  fileData: {
                    fileUri: part.image.toString(),
                    mimeType: (_a = part.mimeType) != null ? _a : "image/jpeg"
                  }
                } : {
                  inlineData: {
                    data: convertUint8ArrayToBase64(part.image),
                    mimeType: (_b = part.mimeType) != null ? _b : "image/jpeg"
                  }
                }
              );
              break;
            }
            case "text": {
              parts.push({ text: part.text });
              break;
            }
          }
        }
        contents.push({ parts, role: "user" });
        break;
      }
    }
  }
  return {
    contents,
    systemInstruction: systemInstructionParts.length > 0 ? { parts: systemInstructionParts } : void 0
  };
}
function getModelPath(modelId) {
  return modelId.includes("/") ? modelId : `models/${modelId}`;
}
function isEmptyObjectSchema(jsonSchema) {
  return jsonSchema != null && typeof jsonSchema === "object" && jsonSchema.type === "object" && (jsonSchema.properties == null || Object.keys(jsonSchema.properties).length === 0) && !jsonSchema.additionalProperties;
}
var googleErrorDataSchema = z.object({
  error: z.object({
    code: z.number().nullable(),
    message: z.string(),
    status: z.string()
  })
});
var googleFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: googleErrorDataSchema,
  errorToMessage: (data) => data.error.message
});
function mapGoogleGenerativeAIFinishReason({
  finishReason,
  hasToolCalls
}) {
  switch (finishReason) {
    case "BLOCKLIST":
    case "IMAGE_SAFETY":
    case "PROHIBITED_CONTENT":
    case "RECITATION":
    case "SAFETY":
    case "SPII":
      return "content-filter";
    case "FINISH_REASON_UNSPECIFIED":
    case "OTHER":
      return "other";
    case "MALFORMED_FUNCTION_CALL":
      return "error";
    case "MAX_TOKENS":
      return "length";
    case "STOP":
      return hasToolCalls ? "tool-calls" : "stop";
    default:
      return "unknown";
  }
}
function prepareTools(mode, useSearchGrounding, dynamicRetrievalConfig, modelId) {
  var _a, _b;
  const tools = ((_a = mode.tools) == null ? void 0 : _a.length) ? mode.tools : void 0;
  const toolWarnings = [];
  const isGemini2 = modelId.includes("gemini-2");
  const supportsDynamicRetrieval = modelId.includes("gemini-1.5-flash") && !modelId.includes("-8b");
  if (useSearchGrounding) {
    return {
      toolConfig: void 0,
      tools: isGemini2 ? { googleSearch: {} } : {
        googleSearchRetrieval: !supportsDynamicRetrieval || !dynamicRetrievalConfig ? {} : { dynamicRetrievalConfig }
      },
      toolWarnings
    };
  }
  if (tools == null) {
    return { toolConfig: void 0, tools: void 0, toolWarnings };
  }
  const functionDeclarations = [];
  for (const tool of tools) {
    if (tool.type === "provider-defined") {
      toolWarnings.push({ tool, type: "unsupported-tool" });
    } else {
      functionDeclarations.push({
        description: (_b = tool.description) != null ? _b : "",
        name: tool.name,
        parameters: convertJSONSchemaToOpenAPISchema(tool.parameters)
      });
    }
  }
  const toolChoice = mode.toolChoice;
  if (toolChoice == null) {
    return {
      toolConfig: void 0,
      tools: { functionDeclarations },
      toolWarnings
    };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
      return {
        toolConfig: { functionCallingConfig: { mode: "AUTO" } },
        tools: { functionDeclarations },
        toolWarnings
      };
    case "none":
      return {
        toolConfig: { functionCallingConfig: { mode: "NONE" } },
        tools: { functionDeclarations },
        toolWarnings
      };
    case "required":
      return {
        toolConfig: { functionCallingConfig: { mode: "ANY" } },
        tools: { functionDeclarations },
        toolWarnings
      };
    case "tool":
      return {
        toolConfig: {
          functionCallingConfig: {
            allowedFunctionNames: [toolChoice.toolName],
            mode: "ANY"
          }
        },
        tools: { functionDeclarations },
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
var GoogleGenerativeAILanguageModel = class {
  get provider() {
    return this.config.provider;
  }
  get supportsStructuredOutputs() {
    var _a;
    return (_a = this.settings.structuredOutputs) != null ? _a : true;
  }
  constructor(modelId, settings, config) {
    this.specificationVersion = "v1";
    this.defaultObjectGenerationMode = "json";
    this.supportsImageUrls = false;
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }
  async doGenerate(options) {
    var _a, _b, _c, _d, _e;
    const { args, warnings } = await this.getArgs(options);
    const body = JSON.stringify(args);
    const mergedHeaders = combineHeaders(
      await resolve(this.config.headers),
      options.headers
    );
    const {
      rawValue: rawResponse,
      responseHeaders,
      value: response
    } = await postJsonToApi({
      abortSignal: options.abortSignal,
      body: args,
      failedResponseHandler: googleFailedResponseHandler,
      fetch: this.config.fetch,
      headers: mergedHeaders,
      successfulResponseHandler: createJsonResponseHandler(responseSchema),
      url: `${this.config.baseURL}/${getModelPath(
        this.modelId
      )}:generateContent`
    });
    const { contents: rawPrompt, ...rawSettings } = args;
    const candidate = response.candidates[0];
    const parts = candidate.content == null || typeof candidate.content !== "object" || !("parts" in candidate.content) ? [] : candidate.content.parts;
    const toolCalls = getToolCallsFromParts({
      // Use candidateParts
      generateId: this.config.generateId,
      parts
    });
    const usageMetadata = response.usageMetadata;
    return {
      files: (_a = getInlineDataParts(parts)) == null ? void 0 : _a.map((part) => ({
        data: part.inlineData.data,
        mimeType: part.inlineData.mimeType
      })),
      finishReason: mapGoogleGenerativeAIFinishReason({
        finishReason: candidate.finishReason,
        hasToolCalls: toolCalls != null && toolCalls.length > 0
      }),
      providerMetadata: {
        google: {
          groundingMetadata: (_d = candidate.groundingMetadata) != null ? _d : null,
          safetyRatings: (_e = candidate.safetyRatings) != null ? _e : null
        }
      },
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { body: rawResponse, headers: responseHeaders },
      reasoning: getReasoningDetailsFromParts(parts),
      request: { body },
      sources: extractSources({
        generateId: this.config.generateId,
        groundingMetadata: candidate.groundingMetadata
      }),
      text: getTextFromParts(parts),
      toolCalls,
      usage: {
        completionTokens: (_c = usageMetadata == null ? void 0 : usageMetadata.candidatesTokenCount) != null ? _c : NaN,
        promptTokens: (_b = usageMetadata == null ? void 0 : usageMetadata.promptTokenCount) != null ? _b : NaN
      },
      warnings
    };
  }
  async doStream(options) {
    const { args, warnings } = await this.getArgs(options);
    const body = JSON.stringify(args);
    const headers = combineHeaders(
      await resolve(this.config.headers),
      options.headers
    );
    const { responseHeaders, value: response } = await postJsonToApi({
      abortSignal: options.abortSignal,
      body: args,
      failedResponseHandler: googleFailedResponseHandler,
      fetch: this.config.fetch,
      headers,
      successfulResponseHandler: createEventSourceResponseHandler(chunkSchema),
      url: `${this.config.baseURL}/${getModelPath(
        this.modelId
      )}:streamGenerateContent?alt=sse`
    });
    const { contents: rawPrompt, ...rawSettings } = args;
    let finishReason = "unknown";
    let usage = {
      completionTokens: Number.NaN,
      promptTokens: Number.NaN
    };
    let providerMetadata = void 0;
    const generateId2 = this.config.generateId;
    let hasToolCalls = false;
    return {
      rawCall: { rawPrompt, rawSettings },
      rawResponse: { headers: responseHeaders },
      request: { body },
      stream: response.pipeThrough(
        new TransformStream({
          flush(controller) {
            controller.enqueue({
              type: "finish",
              finishReason,
              usage,
              providerMetadata
            });
          },
          transform(chunk, controller) {
            var _a, _b, _c, _d, _e, _f;
            if (!chunk.success) {
              controller.enqueue({ type: "error", error: chunk.error });
              return;
            }
            const value = chunk.value;
            const usageMetadata = value.usageMetadata;
            if (usageMetadata != null) {
              usage = {
                promptTokens: (_a = usageMetadata.promptTokenCount) != null ? _a : NaN,
                completionTokens: (_b = usageMetadata.candidatesTokenCount) != null ? _b : NaN
              };
            }
            const candidate = (_c = value.candidates) == null ? void 0 : _c[0];
            if (candidate == null) {
              return;
            }
            const content = candidate.content;
            if (content != null) {
              const deltaText = getTextFromParts(content.parts);
              if (deltaText != null) {
                controller.enqueue({
                  type: "text-delta",
                  textDelta: deltaText
                });
              }
              const reasoningDeltaText = getReasoningDetailsFromParts(
                content.parts
              );
              if (reasoningDeltaText != null) {
                for (const part of reasoningDeltaText) {
                  controller.enqueue({
                    type: "reasoning",
                    textDelta: part.text
                  });
                }
              }
              const inlineDataParts = getInlineDataParts(content.parts);
              if (inlineDataParts != null) {
                for (const part of inlineDataParts) {
                  controller.enqueue({
                    type: "file",
                    mimeType: part.inlineData.mimeType,
                    data: part.inlineData.data
                  });
                }
              }
              const toolCallDeltas = getToolCallsFromParts({
                parts: content.parts,
                generateId: generateId2
              });
              if (toolCallDeltas != null) {
                for (const toolCall of toolCallDeltas) {
                  controller.enqueue({
                    type: "tool-call-delta",
                    toolCallType: "function",
                    toolCallId: toolCall.toolCallId,
                    toolName: toolCall.toolName,
                    argsTextDelta: toolCall.args
                  });
                  controller.enqueue({
                    type: "tool-call",
                    toolCallType: "function",
                    toolCallId: toolCall.toolCallId,
                    toolName: toolCall.toolName,
                    args: toolCall.args
                  });
                  hasToolCalls = true;
                }
              }
            }
            if (candidate.finishReason != null) {
              finishReason = mapGoogleGenerativeAIFinishReason({
                finishReason: candidate.finishReason,
                hasToolCalls
              });
              const sources = (_d = extractSources({
                groundingMetadata: candidate.groundingMetadata,
                generateId: generateId2
              })) != null ? _d : [];
              for (const source of sources) {
                controller.enqueue({ type: "source", source });
              }
              providerMetadata = {
                google: {
                  groundingMetadata: (_e = candidate.groundingMetadata) != null ? _e : null,
                  safetyRatings: (_f = candidate.safetyRatings) != null ? _f : null
                }
              };
            }
          }
        })
      ),
      warnings
    };
  }
  async getArgs({
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
    var _a, _b, _c;
    const type = mode.type;
    const warnings = [];
    const googleOptions = parseProviderOptions({
      provider: "google",
      providerOptions: providerMetadata,
      schema: googleGenerativeAIProviderOptionsSchema
    });
    if (((_a = googleOptions == null ? void 0 : googleOptions.thinkingConfig) == null ? void 0 : _a.includeThoughts) === true && !this.config.provider.startsWith("google.vertex.")) {
      warnings.push({
        message: `The 'includeThoughts' option is only supported with the Google Vertex provider and might not be supported or could behave unexpectedly with the current Google provider (${this.config.provider}).`,
        type: "other"
      });
    }
    const generationConfig = {
      frequencyPenalty,
      // standardized settings:
      maxOutputTokens: maxTokens,
      presencePenalty,
      // response format:
      responseMimeType: (responseFormat == null ? void 0 : responseFormat.type) === "json" ? "application/json" : void 0,
      responseSchema: (responseFormat == null ? void 0 : responseFormat.type) === "json" && responseFormat.schema != null && // Google GenAI does not support all OpenAPI Schema features,
      // so this is needed as an escape hatch:
      this.supportsStructuredOutputs ? convertJSONSchemaToOpenAPISchema(responseFormat.schema) : void 0,
      seed,
      stopSequences,
      temperature,
      topK,
      topP,
      ...this.settings.audioTimestamp && {
        audioTimestamp: this.settings.audioTimestamp
      },
      // provider options:
      responseModalities: googleOptions == null ? void 0 : googleOptions.responseModalities,
      thinkingConfig: googleOptions == null ? void 0 : googleOptions.thinkingConfig
    };
    const { contents, systemInstruction } = convertToGoogleGenerativeAIMessages(prompt);
    switch (type) {
      case "object-json": {
        return {
          args: {
            cachedContent: this.settings.cachedContent,
            contents,
            generationConfig: {
              ...generationConfig,
              responseMimeType: "application/json",
              responseSchema: mode.schema != null && // Google GenAI does not support all OpenAPI Schema features,
              // so this is needed as an escape hatch:
              this.supportsStructuredOutputs ? convertJSONSchemaToOpenAPISchema(mode.schema) : void 0
            },
            safetySettings: this.settings.safetySettings,
            systemInstruction
          },
          warnings
        };
      }
      case "object-tool": {
        return {
          args: {
            cachedContent: this.settings.cachedContent,
            contents,
            generationConfig,
            safetySettings: this.settings.safetySettings,
            systemInstruction,
            toolConfig: { functionCallingConfig: { mode: "ANY" } },
            tools: {
              functionDeclarations: [
                {
                  name: mode.tool.name,
                  description: (_c = mode.tool.description) != null ? _c : "",
                  parameters: convertJSONSchemaToOpenAPISchema(
                    mode.tool.parameters
                  )
                }
              ]
            }
          },
          warnings
        };
      }
      case "regular": {
        const { toolConfig, tools, toolWarnings } = prepareTools(
          mode,
          (_b = this.settings.useSearchGrounding) != null ? _b : false,
          this.settings.dynamicRetrievalConfig,
          this.modelId
        );
        return {
          args: {
            cachedContent: this.settings.cachedContent,
            contents,
            generationConfig,
            safetySettings: this.settings.safetySettings,
            systemInstruction,
            toolConfig,
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
  supportsUrl(url) {
    return this.config.isSupportedUrl(url);
  }
};
function extractSources({
  generateId: generateId2,
  groundingMetadata
}) {
  var _a;
  return (_a = groundingMetadata == null ? void 0 : groundingMetadata.groundingChunks) == null ? void 0 : _a.filter(
    (chunk) => chunk.web != null
  ).map((chunk) => ({
    id: generateId2(),
    sourceType: "url",
    title: chunk.web.title,
    url: chunk.web.uri
  }));
}
function getInlineDataParts(parts) {
  return parts == null ? void 0 : parts.filter(
    (part) => "inlineData" in part
  );
}
function getReasoningDetailsFromParts(parts) {
  const reasoningParts = parts == null ? void 0 : parts.filter(
    (part) => "text" in part && part.thought === true && part.text != null
  );
  return reasoningParts == null || reasoningParts.length === 0 ? void 0 : reasoningParts.map((part) => ({ text: part.text, type: "text" }));
}
function getTextFromParts(parts) {
  const textParts = parts == null ? void 0 : parts.filter(
    (part) => "text" in part && part.thought !== true
  );
  return textParts == null || textParts.length === 0 ? void 0 : textParts.map((part) => part.text).join("");
}
function getToolCallsFromParts({
  generateId: generateId2,
  parts
}) {
  const functionCallParts = parts == null ? void 0 : parts.filter(
    (part) => "functionCall" in part
  );
  return functionCallParts == null || functionCallParts.length === 0 ? void 0 : functionCallParts.map((part) => ({
    args: JSON.stringify(part.functionCall.args),
    toolCallId: generateId2(),
    toolCallType: "function",
    toolName: part.functionCall.name
  }));
}
var contentSchema = z.object({
  parts: z.array(
    z.union([
      // note: order matters since text can be fully empty
      z.object({
        functionCall: z.object({
          args: z.unknown(),
          name: z.string()
        })
      }),
      z.object({
        inlineData: z.object({
          data: z.string(),
          mimeType: z.string()
        })
      }),
      z.object({
        text: z.string().nullish(),
        thought: z.boolean().nullish()
      })
    ])
  ).nullish()
});
var groundingChunkSchema = z.object({
  retrievedContext: z.object({ title: z.string(), uri: z.string() }).nullish(),
  web: z.object({ title: z.string(), uri: z.string() }).nullish()
});
var groundingMetadataSchema = z.object({
  groundingChunks: z.array(groundingChunkSchema).nullish(),
  groundingSupports: z.array(
    z.object({
      confidenceScore: z.array(z.number()).nullish(),
      confidenceScores: z.array(z.number()).nullish(),
      groundingChunkIndices: z.array(z.number()).nullish(),
      segment: z.object({
        endIndex: z.number().nullish(),
        startIndex: z.number().nullish(),
        text: z.string().nullish()
      }),
      segment_text: z.string().nullish(),
      supportChunkIndices: z.array(z.number()).nullish()
    })
  ).nullish(),
  retrievalMetadata: z.union([
    z.object({
      webDynamicRetrievalScore: z.number()
    }),
    z.object({})
  ]).nullish(),
  retrievalQueries: z.array(z.string()).nullish(),
  searchEntryPoint: z.object({ renderedContent: z.string() }).nullish(),
  webSearchQueries: z.array(z.string()).nullish()
});
var safetyRatingSchema = z.object({
  blocked: z.boolean().nullish(),
  category: z.string().nullish(),
  probability: z.string().nullish(),
  probabilityScore: z.number().nullish(),
  severity: z.string().nullish(),
  severityScore: z.number().nullish()
});
var responseSchema = z.object({
  candidates: z.array(
    z.object({
      content: contentSchema.nullish().or(z.object({}).strict()),
      finishReason: z.string().nullish(),
      groundingMetadata: groundingMetadataSchema.nullish(),
      safetyRatings: z.array(safetyRatingSchema).nullish()
    })
  ),
  usageMetadata: z.object({
    candidatesTokenCount: z.number().nullish(),
    promptTokenCount: z.number().nullish(),
    totalTokenCount: z.number().nullish()
  }).nullish()
});
var chunkSchema = z.object({
  candidates: z.array(
    z.object({
      content: contentSchema.nullish(),
      finishReason: z.string().nullish(),
      groundingMetadata: groundingMetadataSchema.nullish(),
      safetyRatings: z.array(safetyRatingSchema).nullish()
    })
  ).nullish(),
  usageMetadata: z.object({
    candidatesTokenCount: z.number().nullish(),
    promptTokenCount: z.number().nullish(),
    totalTokenCount: z.number().nullish()
  }).nullish()
});
var googleGenerativeAIProviderOptionsSchema = z.object({
  responseModalities: z.array(z.enum(["TEXT", "IMAGE"])).nullish(),
  thinkingConfig: z.object({
    includeThoughts: z.boolean().nullish(),
    thinkingBudget: z.number().nullish()
  }).nullish()
});
var GoogleGenerativeAIEmbeddingModel = class {
  get maxEmbeddingsPerCall() {
    return 2048;
  }
  get provider() {
    return this.config.provider;
  }
  get supportsParallelCalls() {
    return true;
  }
  constructor(modelId, settings, config) {
    this.specificationVersion = "v1";
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }
  async doEmbed({
    abortSignal,
    headers,
    values
  }) {
    if (values.length > this.maxEmbeddingsPerCall) {
      throw new TooManyEmbeddingValuesForCallError({
        maxEmbeddingsPerCall: this.maxEmbeddingsPerCall,
        modelId: this.modelId,
        provider: this.provider,
        values
      });
    }
    const mergedHeaders = combineHeaders(
      await resolve(this.config.headers),
      headers
    );
    const { responseHeaders, value: response } = await postJsonToApi({
      abortSignal,
      body: {
        requests: values.map((value) => ({
          content: { parts: [{ text: value }], role: "user" },
          model: `models/${this.modelId}`,
          outputDimensionality: this.settings.outputDimensionality,
          taskType: this.settings.taskType
        }))
      },
      failedResponseHandler: googleFailedResponseHandler,
      fetch: this.config.fetch,
      headers: mergedHeaders,
      successfulResponseHandler: createJsonResponseHandler(
        googleGenerativeAITextEmbeddingResponseSchema
      ),
      url: `${this.config.baseURL}/models/${this.modelId}:batchEmbedContents`
    });
    return {
      embeddings: response.embeddings.map((item) => item.values),
      rawResponse: { headers: responseHeaders },
      usage: void 0
    };
  }
};
var googleGenerativeAITextEmbeddingResponseSchema = z.object({
  embeddings: z.array(z.object({ values: z.array(z.number()) }))
});
function createGoogleGenerativeAI(options = {}) {
  var _a;
  const baseURL = (_a = withoutTrailingSlash(options.baseURL)) != null ? _a : "https://generativelanguage.googleapis.com/v1beta";
  const getHeaders = () => ({
    "x-goog-api-key": loadApiKey({
      apiKey: options.apiKey,
      description: "Google Generative AI",
      environmentVariableName: "GOOGLE_GENERATIVE_AI_API_KEY"
    }),
    ...options.headers
  });
  const createChatModel = (modelId, settings = {}) => {
    var _a2;
    return new GoogleGenerativeAILanguageModel(modelId, settings, {
      baseURL,
      fetch: options.fetch,
      generateId: (_a2 = options.generateId) != null ? _a2 : generateId,
      headers: getHeaders,
      isSupportedUrl: isSupportedFileUrl,
      provider: "google.generative-ai"
    });
  };
  const createEmbeddingModel = (modelId, settings = {}) => new GoogleGenerativeAIEmbeddingModel(modelId, settings, {
    baseURL,
    fetch: options.fetch,
    headers: getHeaders,
    provider: "google.generative-ai"
  });
  const provider = function(modelId, settings) {
    if (new.target) {
      throw new Error(
        "The Google Generative AI model function cannot be called with the new keyword."
      );
    }
    return createChatModel(modelId, settings);
  };
  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.generativeAI = createChatModel;
  provider.embedding = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  return provider;
}
function isSupportedFileUrl(url) {
  return url.toString().startsWith("https://generativelanguage.googleapis.com/v1beta/files/");
}
var google = createGoogleGenerativeAI();

export { createGoogleGenerativeAI, google };
