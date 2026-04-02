// ABOUTME: Covers the one-off LLM generation route without creating chat sessions.
// ABOUTME: Verifies request validation and how route inputs are passed into LLM.stream.

import { afterEach, describe, expect, mock, spyOn, test } from "bun:test"
import { Agent } from "../../src/agent/agent"
import { Instance } from "../../src/project/instance"
import { Provider } from "../../src/provider/provider"
import { ModelID, ProviderID } from "../../src/provider/schema"
import { Server } from "../../src/server/server"
import { LLM } from "../../src/session/llm"
import { Session } from "../../src/session"
import { tmpdir } from "../fixture/fixture"

afterEach(async () => {
  mock.restore()
  await Instance.disposeAll()
})

function fakeModel(id = "test-model") {
  return {
    id: ModelID.make(id),
    providerID: ProviderID.make("test-provider"),
    api: { id, npm: "@ai-sdk/test" },
    headers: {},
    options: {},
    limit: { context: 1024, output: 4096 },
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: false,
      toolcall: false,
      input: { text: true, audio: false, image: false, video: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
  } as any
}

function fakeAgent(prompt?: string) {
  return {
    name: "ephemeral",
    mode: "primary",
    permission: [],
    options: {},
    prompt,
  } as any
}

describe("/llm/generate", () => {
  test("returns 400 when message is missing", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const app = Server.Default().app
        const response = await app.request("/llm/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: "You are helpful." }),
        })

        expect(response.status).toBe(400)
      },
    })
  })

  test("returns 400 when agent does not exist", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        spyOn(Agent, "get").mockResolvedValue(undefined as never)

        const app = Server.Default().app
        const response = await app.request("/llm/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent: "missing", message: "hello" }),
        })
        const result = await response.json()

        expect(response.status).toBe(400)
        expect(result.error).toContain("not found")
      },
    })
  })

  test("uses an ephemeral agent when prompt is provided", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const model = fakeModel()
        spyOn(Provider, "defaultModel").mockResolvedValue({
          providerID: model.providerID,
          modelID: model.id,
        } as any)
        spyOn(Provider, "getModel").mockResolvedValue(model)
        spyOn(Provider, "getSmallModel").mockResolvedValue(undefined as any)
        spyOn(Agent, "defaultAgent").mockResolvedValue("build")
        const stream = spyOn(LLM, "stream").mockResolvedValue({
          text: Promise.resolve("BLUE"),
          usage: Promise.resolve({ inputTokens: 3, outputTokens: 1 }),
        } as any)

        const app = Server.Default().app
        const response = await app.request("/llm/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: "You answer in one word.",
            system: ["Use uppercase."],
            message: "What color is the sky?",
          }),
        })
        const result = await response.json()

        expect(response.status).toBe(200)
        expect(result.text).toBe("BLUE")
        expect(stream).toHaveBeenCalled()
        expect(stream.mock.calls[0]?.[0]?.agent.prompt).toBe("You answer in one word.")
        expect(stream.mock.calls[0]?.[0]?.system).toEqual(["Use uppercase."])
      },
    })
  })

  test("uses an existing agent when agent is provided", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const agent = { ...fakeAgent("Title prompt"), name: "title" }
        const model = fakeModel()
        spyOn(Agent, "get").mockResolvedValue(agent)
        spyOn(Agent, "defaultAgent").mockResolvedValue("build")
        spyOn(Provider, "defaultModel").mockResolvedValue({
          providerID: model.providerID,
          modelID: model.id,
        } as any)
        spyOn(Provider, "getModel").mockResolvedValue(model)
        const stream = spyOn(LLM, "stream").mockResolvedValue({
          text: Promise.resolve("Generated title"),
          usage: Promise.resolve(undefined),
        } as any)

        const app = Server.Default().app
        const response = await app.request("/llm/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent: "title", message: "Fix auth bug" }),
        })

        expect(response.status).toBe(200)
        expect(stream.mock.calls[0]?.[0]?.agent).toBe(agent)
      },
    })
  })

  test("does not create a stored session", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const before = [] as string[]
        for await (const session of Session.list()) before.push(session.id)

        const model = fakeModel()
        spyOn(Provider, "defaultModel").mockResolvedValue({
          providerID: model.providerID,
          modelID: model.id,
        } as any)
        spyOn(Provider, "getModel").mockResolvedValue(model)
        spyOn(Provider, "getSmallModel").mockResolvedValue(undefined as any)
        spyOn(Agent, "defaultAgent").mockResolvedValue("build")
        spyOn(LLM, "stream").mockResolvedValue({
          text: Promise.resolve("hello"),
          usage: Promise.resolve(undefined),
        } as any)

        const app = Server.Default().app
        const response = await app.request("/llm/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: "Be brief.", message: "Say hello" }),
        })

        const after = [] as string[]
        for await (const session of Session.list()) after.push(session.id)

        expect(response.status).toBe(200)
        expect(after).toEqual(before)
      },
    })
  })

  test("prefers an explicit model over small model lookup", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const model = fakeModel("explicit-model")
        const getModel = spyOn(Provider, "getModel").mockResolvedValue(model)
        const getSmallModel = spyOn(Provider, "getSmallModel").mockResolvedValue(fakeModel("small-model"))
        spyOn(Agent, "defaultAgent").mockResolvedValue("build")
        const stream = spyOn(LLM, "stream").mockResolvedValue({
          text: Promise.resolve("done"),
          usage: Promise.resolve({ inputTokens: 5, outputTokens: 2 }),
        } as any)

        const app = Server.Default().app
        const response = await app.request("/llm/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "Hi",
            model: { providerID: "test-provider", modelID: "explicit-model" },
            small: true,
            maxTokens: 50,
          }),
        })
        const result = await response.json()

        expect(response.status).toBe(200)
        expect(getModel).toHaveBeenCalledWith(ProviderID.make("test-provider"), ModelID.make("explicit-model"))
        expect(getSmallModel).not.toHaveBeenCalled()
        expect(stream.mock.calls[0]?.[0]?.model.id).toBe(ModelID.make("explicit-model"))
        expect(stream.mock.calls[0]?.[0]?.model.limit.output).toBe(50)
        expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 2 })
      },
    })
  })
})
