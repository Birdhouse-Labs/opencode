// ABOUTME: Covers the one-off LLM generation route without creating chat sessions.
// ABOUTME: Verifies request validation and error handling for the generate endpoint.

import { afterEach, describe, expect, test } from "bun:test"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"
import { tmpdir } from "../fixture/fixture"

afterEach(async () => {
  await Instance.disposeAll()
})

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
        const app = Server.Default().app
        const response = await app.request("/llm/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent: "missing-agent-that-does-not-exist", message: "hello" }),
        })
        const result = await response.json()

        expect(response.status).toBe(400)
        expect(result.error).toContain("not found")
      },
    })
  })
})
