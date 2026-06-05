// ABOUTME: Implements the HttpApi handler for ephemeral LLM generation.
// ABOUTME: Generates text responses without session creation or message persistence.

import { Agent } from "@/agent/agent"
import { Provider } from "@/provider/provider"
import { LLM } from "@/session/llm"
import { MessageID, SessionID } from "@/session/schema"
import { Effect, Stream } from "effect"
import { HttpApiError } from "effect/unstable/httpapi"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { LlmGeneratePayload } from "../groups/llm"

export const llmHandlers = HttpApiBuilder.group(InstanceHttpApi, "llm", (handlers) =>
  Effect.gen(function* () {
    const agentSvc = yield* Agent.Service
    const providerSvc = yield* Provider.Service
    const llmSvc = yield* LLM.Service

    const generate = Effect.fn("LlmHttpApi.generate")(function* (ctx) {
      const body = ctx.payload

      let agent = body.agent ? yield* agentSvc.get(body.agent) : undefined
      if (body.agent && !agent) {
        return yield* Effect.fail(new HttpApiError.BadRequest({}))
      }

      if (!agent) {
        agent = {
          name: "ephemeral",
          mode: "primary",
          permission: [],
          options: {},
          prompt: body.prompt,
        } as unknown as Agent.Info
      }

      const defaultModelResult = body.model
        ? ({ providerID: body.model.providerID as any, modelID: body.model.modelID as any } as const)
        : (yield* providerSvc.defaultModel().pipe(
            Effect.catch(() => Effect.fail(new HttpApiError.BadRequest({}))),
          ))
      const selectedModel = defaultModelResult
      let model = yield* providerSvc.getModel(selectedModel.providerID, selectedModel.modelID).pipe(
        Effect.catch(() => Effect.fail(new HttpApiError.BadRequest({}))),
      )
      if (body.small && !body.model) {
        model = (yield* providerSvc.getSmallModel(model.providerID)) ?? model
      }
      if (body.maxTokens !== undefined) {
        model = {
          ...model,
          limit: {
            ...model.limit,
            output: body.maxTokens,
          },
        }
      }

      const defaultAgent = yield* agentSvc.defaultAgent()
      const sessionID = SessionID.create()

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
          system: body.system ? [...body.system] : [],
          small: body.small ?? true,
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
        } else if (event.type === "step-finish") {
          inputTokens = event.usage?.inputTokens
          outputTokens = event.usage?.outputTokens
        }
      }

      const cleaned = text
        .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? ""

      return {
        text: cleaned,
        usage:
          inputTokens !== undefined && outputTokens !== undefined
            ? { inputTokens, outputTokens }
            : undefined,
      }
    })

    return handlers.handle("generate", generate)
  }),
)
