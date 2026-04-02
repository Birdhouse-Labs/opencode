// ABOUTME: Exercises Session.fork behavior for user and assistant target messages.
// ABOUTME: Confirms forks exclude user targets but include assistant targets.

import { afterEach, describe, expect, test } from "bun:test"
import { Session } from "../../src/session"
import { ModelID, ProviderID } from "../../src/provider/schema"
import { MessageID, type SessionID } from "../../src/session/schema"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

afterEach(async () => {
  await Instance.disposeAll()
})

async function createUserMessage(sessionID: SessionID) {
  return Session.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID,
    agent: "build",
    model: { providerID: ProviderID.make("test"), modelID: ModelID.make("test") },
    time: { created: Date.now() },
  })
}

async function createAssistantMessage(sessionID: SessionID, parentID: MessageID) {
  return Session.updateMessage({
    id: MessageID.ascending(),
    sessionID,
    role: "assistant",
    time: { created: Date.now() },
    parentID,
    modelID: ModelID.make("test"),
    providerID: ProviderID.make("test"),
    mode: "build",
    agent: "build",
    path: { cwd: "/tmp", root: "/tmp" },
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
  })
}

describe("Session.fork", () => {
  test("excludes the target when forking from a user message", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const user1 = await createUserMessage(session.id)
        const assistant1 = await createAssistantMessage(session.id, user1.id)
        const user2 = await createUserMessage(session.id)

        const forked = await Session.fork({ sessionID: session.id, messageID: user2.id })
        const messages = await Session.messages({ sessionID: forked.id })

        expect(messages).toHaveLength(2)
        expect(messages[0].info.role).toBe("user")
        expect(messages[1].info.role).toBe("assistant")
        if (messages[1].info.role === "assistant") {
          expect(messages[1].info.parentID).toBe(messages[0].info.id)
        }

        await Session.remove(session.id)
        await Session.remove(forked.id)
        void assistant1
      },
    })
  })

  test("includes the target when forking from an assistant message", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await Session.create({})
        const user1 = await createUserMessage(session.id)
        const assistant1 = await createAssistantMessage(session.id, user1.id)
        await createUserMessage(session.id)

        const forked = await Session.fork({ sessionID: session.id, messageID: assistant1.id })
        const messages = await Session.messages({ sessionID: forked.id })

        expect(messages).toHaveLength(2)
        expect(messages[0].info.role).toBe("user")
        expect(messages[1].info.role).toBe("assistant")
        if (messages[1].info.role === "assistant") {
          expect(messages[1].info.parentID).toBe(messages[0].info.id)
        }

        await Session.remove(session.id)
        await Session.remove(forked.id)
      },
    })
  })
})
