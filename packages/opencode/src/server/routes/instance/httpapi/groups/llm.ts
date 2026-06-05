// ABOUTME: Defines the HttpApi group for LLM generation endpoints.
// ABOUTME: Exposes one-off text generation without creating or storing sessions.

import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import { WorkspaceRoutingMiddleware, WorkspaceRoutingQuery } from "../middleware/workspace-routing"
import { described } from "./metadata"

export const LlmGeneratePayload = Schema.Struct({
  prompt: Schema.optional(Schema.String),
  system: Schema.optional(Schema.Array(Schema.String)),
  message: Schema.String,
  agent: Schema.optional(Schema.String),
  model: Schema.optional(
    Schema.Struct({
      providerID: Schema.String,
      modelID: Schema.String,
    }),
  ),
  small: Schema.optional(Schema.Boolean),
  maxTokens: Schema.optional(Schema.Int),
}).annotate({ identifier: "LlmGeneratePayload" })

const LlmGenerateResult = Schema.Struct({
  text: Schema.String,
  usage: Schema.optional(
    Schema.Struct({
      inputTokens: Schema.Number,
      outputTokens: Schema.Number,
    }),
  ),
}).annotate({ identifier: "LlmGenerateResult" })

export const LlmPaths = {
  generate: "/llm/generate",
} as const

export const LlmApi = HttpApi.make("llm").add(
  HttpApiGroup.make("llm")
    .add(
      HttpApiEndpoint.post("generate", LlmPaths.generate, {
        query: WorkspaceRoutingQuery,
        payload: LlmGeneratePayload,
        success: described(LlmGenerateResult, "Generated text response"),
        error: HttpApiError.BadRequest,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "llm.generate",
          summary: "Generate LLM response",
          description: "Generate a one-off LLM response without creating a session or storing messages.",
        }),
      ),
    )
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization)
    .annotateMerge(OpenApi.annotations({ title: "llm", description: "LLM generation routes." })),
)
