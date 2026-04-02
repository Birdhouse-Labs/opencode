// ABOUTME: Exposes one-off LLM generation endpoints for request/response use cases.
// ABOUTME: Lets callers generate text without creating or persisting a chat session.

import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Agent } from "@/agent/agent"
import { errors } from "@/server/error"
import { Provider } from "@/provider/provider"
import { ModelID, ProviderID } from "@/provider/schema"
import { LLM } from "@/session/llm"
import { MessageID, SessionID } from "@/session/schema"
import { lazy } from "@/util/lazy"

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

      let agent = body.agent ? await Agent.get(body.agent) : undefined
      if (body.agent && !agent) {
        return c.json({ error: `Agent '${body.agent}' not found` }, 400)
      }

      if (!agent) {
        agent = {
          name: "ephemeral",
          mode: "primary",
          permission: [],
          options: {},
          prompt: body.prompt,
        }
      }

      const selected = body.model ?? (await Provider.defaultModel())
      let model = await Provider.getModel(selected.providerID, selected.modelID)
      if (body.small && !body.model) {
        model = (await Provider.getSmallModel(model.providerID)) ?? model
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

      const result = await LLM.stream({
        agent,
        user: {
          id: MessageID.ascending(),
          role: "user",
          sessionID: SessionID.make("ephemeral"),
          time: { created: Date.now() },
          agent: await Agent.defaultAgent(),
          model: {
            providerID: model.providerID,
            modelID: model.id,
          },
        },
        system: body.system ?? [],
        small: body.small,
        tools: {},
        model,
        abort: new AbortController().signal,
        sessionID: SessionID.make("ephemeral"),
        retries: 2,
        messages: [
          {
            role: "user",
            content: body.message,
          },
        ],
      })

      const usage = await result.usage

      return c.json({
        text: await result.text,
        usage: usage
          ? {
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
            }
          : undefined,
      })
    },
  ),
)
