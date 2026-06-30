import { S as SERVER_ROUTES, s as schemaToJsonSchema } from './index.mjs';
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
import 'zod';
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

function asJsonSchema(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function buildApiSchemaManifest(routes = SERVER_ROUTES) {
  return {
    routes: routes.filter(isManifestRoute).map((route) => {
      const responseSchema = convertSchema(route.responseSchema);
      return {
        bodySchema: convertSchema(route.bodySchema),
        method: route.method,
        path: route.path,
        pathParamSchema: convertSchema(route.pathParamSchema),
        queryParamSchema: convertSchema(route.queryParamSchema),
        responseSchema,
        responseShape: inferResponseShape(responseSchema),
        responseType: route.responseType
      };
    }),
    version: 1
  };
}
// src/server/server-adapter/api-schema-manifest.ts
function convertSchema(schema) {
  return schema ? schemaToJsonSchema(schema) : void 0;
}
function inferResponseShape(responseSchema) {
  if (!responseSchema) return { kind: "unknown" };
  const type = schemaType(responseSchema);
  if (type === "array") return { kind: "array" };
  if (type !== "object") return { kind: "single" };
  const properties = responseSchema.properties && !Array.isArray(responseSchema.properties) ? responseSchema.properties : {};
  const propertyNames = Object.keys(properties);
  const paginationProperty = "page" in properties ? "page" : "pagination" in properties ? "pagination" : void 0;
  const listProperty = Object.entries(properties).find(
    ([, property]) => schemaType(asJsonSchema(property)) === "array"
  )?.[0];
  if (listProperty && (paginationProperty || propertyNames.length <= 2)) {
    return { kind: "object-property", listProperty, paginationProperty };
  }
  if (responseSchema.additionalProperties && propertyNames.length === 0) return { kind: "record" };
  return { kind: "single" };
}
function isManifestRoute(route) {
  return route.responseType === "json" && !route.deprecated;
}
function schemaType(schema) {
  const type = schema?.type;
  return Array.isArray(type) ? type.find(Boolean) : type;
}

export { buildApiSchemaManifest };
