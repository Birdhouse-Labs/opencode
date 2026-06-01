// ABOUTME: Exercises Session.fork behavior for user and assistant target messages.
// ABOUTME: Confirms forks exclude user targets but include assistant targets.

import { afterEach, describe, expect, test } from "bun:test"
import { Session as SessionNs } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import { MessageID, type SessionID } from "../../src/session/schema"
import { Instance } from "../../src/project/instance"
import { AppRuntime } from "../../src/effect/app-runtime"
import { tmpdir } from "../fixture/fixture"

afterEach(async () => {
  await Instance.disposeAll()
})

function create(input?: SessionNs.CreateInput) {
  return AppRuntime.runPromise(SessionNs.Service.use((svc) => svc.create(input)))
}

function remove(id: SessionID) {
  return AppRuntime.runPromise(SessionNs.Service.use((svc) => svc.remove(id)))
}

function fork(input: { sessionID: SessionID; messageID?: MessageID }) {
  return AppRuntime.runPromise(SessionNs.Service.use((svc) => svc.fork(input)))
}

function getMessages(sessionID: SessionID) {
  return AppRuntime.runPromise(SessionNs.Service.use((svc) => svc.messages({ sessionID })))
}

function updateMessage<T extends MessageV2.Info>(msg: T) {
  return AppRuntime.runPromise(SessionNs.Service.use((svc) => svc.updateMessage(msg)))
}

async function createUserMessage(sessionID: SessionID) {
  return updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID,
    agent: "build",
    model: { providerID: "test", modelID: "test" },
    time: { created: Date.now() },
  } as unknown as MessageV2.Info)
}

async function createAssistantMessage(sessionID: SessionID, parentID: MessageID) {
  return updateMessage({
    id: MessageID.ascending(),
    sessionID,
    role: "assistant",
    time: { created: Date.now() },
    parentID,
    modelID: "test",
    providerID: "test",
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
  } as unknown as MessageV2.Assistant)
}

describe("Session.fork", () => {
  test("excludes the target when forking from a user message", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await create({})
        const user1 = await createUserMessage(session.id)
        const assistant1 = await createAssistantMessage(session.id, user1.id as MessageID)
        const user2 = await createUserMessage(session.id)

        const forked = await fork({ sessionID: session.id, messageID: user2.id as MessageID })
        const messages = await getMessages(forked.id)

        expect(messages).toHaveLength(2)
        expect(messages[0].info.role).toBe("user")
        expect(messages[1].info.role).toBe("assistant")
        if (messages[1].info.role === "assistant") {
          expect(messages[1].info.parentID).toBe(messages[0].info.id)
        }

        await remove(session.id)
        await remove(forked.id)
        void assistant1
      },
    })
  })

  test("includes the target when forking from an assistant message", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await create({})
        const user1 = await createUserMessage(session.id)
        const assistant1 = await createAssistantMessage(session.id, user1.id as MessageID)
        await createUserMessage(session.id)

        const forked = await fork({ sessionID: session.id, messageID: assistant1.id as MessageID })
        const messages = await getMessages(forked.id)

        expect(messages).toHaveLength(2)
        expect(messages[0].info.role).toBe("user")
        expect(messages[1].info.role).toBe("assistant")
        if (messages[1].info.role === "assistant") {
          expect(messages[1].info.parentID).toBe(messages[0].info.id)
        }

        await remove(session.id)
        await remove(forked.id)
      },
    })
  })
})
