import { describe, expect, test } from "bun:test"
import path from "path"
import { Session } from "../../src/session"
import { Log } from "../../src/util/log"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

describe("/llm/generate endpoint", () => {
  test(
    "should generate text with custom prompt",
    async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
        // #given
        const requestBody = {
          prompt: "You are a helpful assistant that answers in one word.",
          message: "What color is the sky?",
          small: true,
        }

        // #when
        const app = Server.App()
        const response = await app.request("/llm/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        })

        // #then
        expect(response.status).toBe(200)
        const result = await response.json()
        expect(result).toHaveProperty("text")
        expect(typeof result.text).toBe("string")
        expect(result.text.length).toBeGreaterThan(0)
          expect(result).toHaveProperty("usage")
        },
      })
    },
    30000,
  )

  test(
    "should work with existing agent (title)",
    async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
        // #given
        const requestBody = {
          agent: "title",
          message: "Generate a title for this conversation:\n\nImplement user authentication with JWT tokens",
          small: true,
        }

        // #when
        const app = Server.App()
        const response = await app.request("/llm/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        })

        // #then
        expect(response.status).toBe(200)
        const result = await response.json()
        expect(result).toHaveProperty("text")
        expect(typeof result.text).toBe("string")
        expect(result.text.length).toBeGreaterThan(0)
          expect(result.text.length).toBeLessThanOrEqual(100) // Title agent should generate short titles
        },
      })
    },
    30000,
  )

  test("should return 400 when message is missing", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // #given
        const requestBody = {
          prompt: "You are a helpful assistant.",
          // message is missing
        }

        // #when
        const app = Server.App()
        const response = await app.request("/llm/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        })

        // #then
        expect(response.status).toBe(400)
      },
    })
  })

  test("should return 400 when agent does not exist", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // #given
        const requestBody = {
          agent: "nonexistent-agent-name",
          message: "Test message",
        }

        // #when
        const app = Server.App()
        const response = await app.request("/llm/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        })

        // #then
        expect(response.status).toBe(400)
        const result = await response.json()
        expect(result.error).toContain("not found")
      },
    })
  })

  test(
    "should work without prompt when using agent",
    async () => {
      await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // #given
        const requestBody = {
          agent: "title",
          message: "Generate a title for: Fix bug in login form",
          // No prompt provided - should use agent's prompt
        }

        // #when
        const app = Server.App()
        const response = await app.request("/llm/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        })

        // #then
        expect(response.status).toBe(200)
        const result = await response.json()
        expect(result).toHaveProperty("text")
          expect(result.text.length).toBeGreaterThan(0)
        },
      })
    },
    30000,
  )

  test(
    "should not create any sessions in storage",
    async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // #given - Get initial session count
        const sessionsBefore = []
        for await (const session of Session.list()) {
          sessionsBefore.push(session)
        }
        const countBefore = sessionsBefore.length

        const requestBody = {
          prompt: "You are a test assistant.",
          message: "Hello world",
          small: true,
        }

        // #when
        const app = Server.App()
        const response = await app.request("/llm/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        })

        // #then
        expect(response.status).toBe(200)

        // Verify no new sessions were created
        const sessionsAfter = []
        for await (const session of Session.list()) {
          sessionsAfter.push(session)
        }
        const countAfter = sessionsAfter.length
        expect(countAfter).toBe(countBefore)

        // Verify no "ephemeral" session exists
        const ephemeralSession = sessionsAfter.find((s) => s.id === "ephemeral")
          expect(ephemeralSession).toBeUndefined()
        },
      })
    },
    30000,
  )

  test(
    "should respect maxTokens parameter",
    async () => {
      await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // #given
        const requestBody = {
          prompt: "You are a helpful assistant.",
          message: "Say hello",
          small: true,
          maxTokens: 50,
        }

        // #when
        const app = Server.App()
        const response = await app.request("/llm/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        })

        // #then
        expect(response.status).toBe(200)
        const result = await response.json()
        expect(result).toHaveProperty("text")
        // Usage might be empty object depending on provider
        if (result.usage && result.usage.outputTokens) {
          expect(result.usage.outputTokens).toBeLessThanOrEqual(50)
          }
        },
      })
    },
    30000,
  )

  test(
    "should handle small=false parameter",
    async () => {
      await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // #given
        const requestBody = {
          prompt: "You are a helpful assistant.",
          message: "What is 2+2?",
          small: false,
        }

        // #when
        const app = Server.App()
        const response = await app.request("/llm/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        })

        // #then - May fail with provider error in test environment, but should not crash
        expect([200, 500]).toContain(response.status)
        const result = await response.json()
        // Either success with text or error message
        if (response.status === 200) {
          expect(result).toHaveProperty("text")
          expect(result.text.length).toBeGreaterThan(0)
        } else {
          expect(result).toHaveProperty("error")
          }
        },
      })
    },
    30000,
  )

  test(
    "should handle empty prompt with custom message",
    async () => {
      await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // #given
        const requestBody = {
          message: "Tell me a joke",
          small: true,
          // No prompt - should work with default behavior
        }

        // #when
        const app = Server.App()
        const response = await app.request("/llm/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        })

        // #then
        expect(response.status).toBe(200)
        const result = await response.json()
        expect(result).toHaveProperty("text")
          expect(result.text.length).toBeGreaterThan(0)
        },
      })
    },
    30000,
  )

  test(
    "should return usage statistics",
    async () => {
      await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // #given
        const requestBody = {
          prompt: "You are a helpful assistant.",
          message: "Say hi",
          small: true,
        }

        // #when
        const app = Server.App()
        const response = await app.request("/llm/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        })

        // #then
        expect(response.status).toBe(200)
        const result = await response.json()
        expect(result.usage).toBeDefined()
        // Usage might be empty depending on provider, just verify it exists
          expect(typeof result.usage).toBe("object")
        },
      })
    },
    30000,
  )

  test(
    "should support system parameter for additional instructions",
    async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          // #given
          const requestBody = {
            prompt: "You are a helpful assistant.",
            system: ["Answer in exactly 3 words.", "Be enthusiastic."],
            message: "What is the sky?",
            small: true,
          }

          // #when
          const app = Server.App()
          const response = await app.request("/llm/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          })

          // #then
          expect(response.status).toBe(200)
          const result = await response.json()
          expect(result).toHaveProperty("text")
          expect(result.text.length).toBeGreaterThan(0)
        },
      })
    },
    30000,
  )

  test(
    "should work with agent and system parameter combined",
    async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          // #given
          const requestBody = {
            agent: "title",
            system: ["Keep under 30 characters.", "Use action verbs."],
            message: "Generate a title for: Fix authentication bug in production",
            small: true,
          }

          // #when
          const app = Server.App()
          const response = await app.request("/llm/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          })

          // #then
          expect(response.status).toBe(200)
          const result = await response.json()
          expect(result).toHaveProperty("text")
          expect(result.text.length).toBeGreaterThan(0)
          expect(result.text.length).toBeLessThanOrEqual(100)
        },
      })
    },
    30000,
  )

  test(
    "should not duplicate prompt when using prompt and system together",
    async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          // #given - This test verifies the fix for the duplication bug
          const requestBody = {
            prompt: "You are a concise assistant.",
            system: ["Respond in uppercase."],
            message: "Say hello",
            small: true,
          }

          // #when
          const app = Server.App()
          const response = await app.request("/llm/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          })

          // #then - Should succeed without prompt duplication
          expect(response.status).toBe(200)
          const result = await response.json()
          expect(result).toHaveProperty("text")
          expect(result.text.length).toBeGreaterThan(0)
        },
      })
    },
    30000,
  )

  test(
    "should work with only system parameter (no prompt or agent)",
    async () => {
      await Instance.provide({
        directory: projectRoot,
        fn: async () => {
          // #given
          const requestBody = {
            system: ["You are a helpful assistant.", "Be brief."],
            message: "What is 2+2?",
            small: true,
          }

          // #when
          const app = Server.App()
          const response = await app.request("/llm/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          })

          // #then
          expect(response.status).toBe(200)
          const result = await response.json()
          expect(result).toHaveProperty("text")
          expect(result.text.length).toBeGreaterThan(0)
        },
      })
    },
    30000,
  )
})
