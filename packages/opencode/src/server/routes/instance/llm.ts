// ABOUTME: Exposes one-off LLM generation endpoints for request/response use cases.
// ABOUTME: Lets callers generate text without creating or persisting a chat session.

import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { Effect } from "effect"
import * as Stream from "effect/Stream"
import z from "zod"
import { Agent } from "@/agent/agent"
import { errors } from "../../error"
import { Provider } from "@/provider"
import { ModelID, ProviderID } from "@/provider/schema"
import { LLM } from "@/session/llm"
import { MessageID, SessionID } from "@/session/schema"
import { lazy } from "@/util/lazy"
import { AppRuntime } from "@/effect/app-runtime"

const GenerateRequest = z.object({
  prompt: z.string().optional().describe("Base system prompt used when no agent is provided"),
  system: z.array(z.string()).optional().describe("Additional system instructions for this call"),
  message: z.string().describe("User message"),
  agent: z.string().optional().describe("Existing agent to use for the call"),
  model: z
    .object({
      providerID: ProviderID.zod,
      modelID: ModelID.zod,
    })
    .optional()
    .describe("Specific model to use"),
  small: z.boolean().optional().default(true).describe("Use the provider's small model when available"),
  maxTokens: z.number().int().positive().optional().describe("Maximum output tokens"),
})

const GenerateResponse = z.object({
  text: z.string(),
  usage: z
    .object({
      inputTokens: z.number(),
      outputTokens: z.number(),
    })
    .optional(),
})

export const LlmRoutes = lazy(() =>
  new Hono().post(
    "/generate",
    describeRoute({
      summary: "Generate LLM response",
      description: "Generate a one-off LLM response without creating a session or storing messages.",
      operationId: "llm.generate",
      responses: {
        200: {
          description: "Generated text response",
          content: {
            "application/json": {
              schema: resolver(GenerateResponse),
            },
          },
        },
        ...errors(400),
      },
    }),
    validator("json", GenerateRequest),
    async (c) => {
      const body = c.req.valid("json")

      const result = await AppRuntime.runPromise(
        Effect.gen(function* () {
          const agentSvc = yield* Agent.Service
          const providerSvc = yield* Provider.Service
          const llmSvc = yield* LLM.Service

          let agent = body.agent ? yield* agentSvc.get(body.agent) : undefined
          if (body.agent && !agent) {
            return { error: `Agent '${body.agent}' not found` as string | undefined, result: undefined }
          }

          if (!agent) {
            agent = {
              name: "ephemeral",
              mode: "primary",
              permission: [],
              options: {},
              prompt: body.prompt,
            } as Agent.Info
          }

          const selectedModel = body.model ?? (yield* providerSvc.defaultModel())
          let model = yield* providerSvc.getModel(
            selectedModel.providerID as ProviderID,
            selectedModel.modelID as ModelID,
          )
          if (body.small && !body.model) {
            model = (yield* providerSvc.getSmallModel(model.providerID)) ?? model
          }
          if (body.maxTokens) {
            model = {
              ...model,
              limit: {
                ...model.limit,
                output: body.maxTokens,
              },
            }
          }

          const defaultAgent = yield* agentSvc.defaultAgent()
          const sessionID = SessionID.make("ephemeral")

          const events = yield* llmSvc
            .stream({
              agent,
              user: {
                id: MessageID.ascending(),
                role: "user",
                sessionID,
                time: { created: Date.now() },
                agent: defaultAgent,
                model: {
                  providerID: model.providerID,
                  modelID: model.id,
                },
              },
              system: body.system ?? [],
              small: body.small,
              tools: {},
              model,
              sessionID,
              retries: 2,
              messages: [
                {
                  role: "user",
                  content: body.message,
                },
              ],
            })
            .pipe(Stream.runCollect, Effect.orDie)

          let text = ""
          let inputTokens: number | undefined
          let outputTokens: number | undefined

          for (const event of events) {
            if (event.type === "text-delta") {
              text += event.text
            } else if (event.type === "finish-step") {
              inputTokens = event.usage?.inputTokens
              outputTokens = event.usage?.outputTokens
            }
          }

          return {
            error: undefined,
            result: {
              text,
              usage:
                inputTokens !== undefined || outputTokens !== undefined
                  ? {
                      inputTokens: inputTokens ?? 0,
                      outputTokens: outputTokens ?? 0,
                    }
                  : undefined,
            },
          }
        }),
      )

      if (result.error) {
        return c.json({ error: result.error }, 400)
      }

      return c.json(result.result!)
    },
  ),
)
