import { describe, expect, test } from "bun:test"
import path from "path"
import { Session } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import { Identifier } from "../../src/id/id"
import { Log } from "../../src/util/log"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

describe("session/:sessionID/wait endpoint", () => {
  test("should return 404 when session does not exist", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // #given
        const nonExistentSessionID = "ses_nonexistent123"

        // #when
        const app = Server.App()
        const response = await app.request(`/session/${nonExistentSessionID}/wait`, {
          method: "POST",
        })

        // #then
        expect(response.status).toBe(404)
      },
    })
  })

  test("should return 400 when session ID format is invalid", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // #given
        const invalidSessionID = "invalid_session_id"

        // #when
        const app = Server.App()
        const response = await app.request(`/session/${invalidSessionID}/wait`, {
          method: "POST",
        })

        // #then
        expect(response.status).toBe(400)
      },
    })
  })

  test("should return immediately when session already has finished message", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // #given - Create a session with completed messages
        const session = await Session.create({})

        // Create user message
        const userMessage: MessageV2.User = {
          id: Identifier.ascending("message"),
          sessionID: session.id,
          role: "user",
          time: { created: Date.now() },
          agent: "build",
          model: {
            providerID: "anthropic",
            modelID: "claude-3-5-sonnet-20241022",
          },
        }
        await Session.updateMessage(userMessage)

        // Create assistant message with finish="stop" (completed)
        // Note: Identifier.ascending() guarantees monotonic ordering via internal counter
        const assistantMessage: MessageV2.Assistant = {
          id: Identifier.ascending("message"),
          sessionID: session.id,
          role: "assistant",
          time: { created: Date.now() },
          parentID: userMessage.id,
          modelID: "claude-3-5-sonnet-20241022",
          providerID: "anthropic",
          mode: "build",
          agent: "build",
          finish: "stop", // Completed, not "tool-calls" or "unknown"
          path: { cwd: projectRoot, root: projectRoot },
          cost: 0,
          tokens: {
            input: 100,
            output: 50,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        }
        await Session.updateMessage(assistantMessage)

        // Add a text part to the assistant message
        const textPart: MessageV2.TextPart = {
          id: Identifier.ascending("part"),
          sessionID: session.id,
          messageID: assistantMessage.id,
          type: "text",
          text: "Task completed successfully",
        }
        await Session.updatePart(textPart)

        // #when - Call the wait endpoint
        const app = Server.App()
        const response = await app.request(`/session/${session.id}/wait`, {
          method: "POST",
        })

        // #then - Verify response
        expect(response.status).toBe(200)
        const result = await response.json()
        expect(result.info.role).toBe("assistant")
        expect(result.info.finish).toBe("stop")
        expect(result.parts).toHaveLength(1)
        expect(result.parts[0].text).toBe("Task completed successfully")

        await Session.remove(session.id)
      },
    })
  })

  test("should return message with multiple text parts", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        // #given
        const session = await Session.create({})

        const userMessage: MessageV2.User = {
          id: Identifier.ascending("message"),
          sessionID: session.id,
          role: "user",
          time: { created: Date.now() },
          agent: "build",
          model: {
            providerID: "anthropic",
            modelID: "claude-3-5-sonnet-20241022",
          },
        }
        await Session.updateMessage(userMessage)

        // Identifier.ascending() guarantees monotonic ordering via internal counter
        const assistantMessage: MessageV2.Assistant = {
          id: Identifier.ascending("message"),
          sessionID: session.id,
          role: "assistant",
          time: { created: Date.now() },
          parentID: userMessage.id,
          modelID: "claude-3-5-sonnet-20241022",
          providerID: "anthropic",
          mode: "build",
          agent: "build",
          finish: "stop",
          path: { cwd: projectRoot, root: projectRoot },
          cost: 0,
          tokens: {
            input: 100,
            output: 50,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
        }
        await Session.updateMessage(assistantMessage)

        // Add multiple text parts
        const part1: MessageV2.TextPart = {
          id: Identifier.ascending("part"),
          sessionID: session.id,
          messageID: assistantMessage.id,
          type: "text",
          text: "First part",
        }
        const part2: MessageV2.TextPart = {
          id: Identifier.ascending("part"),
          sessionID: session.id,
          messageID: assistantMessage.id,
          type: "text",
          text: "Second part",
        }
        await Session.updatePart(part1)
        await Session.updatePart(part2)

        // #when
        const app = Server.App()
        const response = await app.request(`/session/${session.id}/wait`, {
          method: "POST",
        })

        // #then
        expect(response.status).toBe(200)
        const result = await response.json()
        expect(result.parts).toHaveLength(2)
        expect(result.parts[0].text).toBe("First part")
        expect(result.parts[1].text).toBe("Second part")

        await Session.remove(session.id)
      },
    })
  })
})
