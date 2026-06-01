// ABOUTME: Verifies the session wait route blocks on SessionPrompt completion semantics.
// ABOUTME: Covers request validation, missing sessions, and successful response payloads.

import { afterEach, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"
import { Session as SessionNs } from "../../src/session"
import { MessageV2 } from "../../src/session/message-v2"
import { MessageID, PartID, type SessionID } from "../../src/session/schema"
import { Log } from "../../src/util"
import { tmpdir } from "../fixture/fixture"

void Log.init({ print: false })

function run<A, E>(fx: Effect.Effect<A, E, SessionNs.Service>) {
  return Effect.runPromise(fx.pipe(Effect.provide(SessionNs.defaultLayer)))
}

const svc = {
  create(input?: SessionNs.CreateInput) {
    return run(SessionNs.Service.use((s) => s.create(input)))
  },
  remove(id: SessionID) {
    return run(SessionNs.Service.use((s) => s.remove(id)))
  },
  updateMessage<T extends MessageV2.Info>(msg: T) {
    return run(SessionNs.Service.use((s) => s.updateMessage(msg)))
  },
  updatePart<T extends MessageV2.Part>(part: T) {
    return run(SessionNs.Service.use((s) => s.updatePart(part)))
  },
}

afterEach(async () => {
  await Instance.disposeAll()
})

async function createUserMessage(sessionID: SessionID, text: string) {
  const message = await svc.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID,
    agent: "build",
    model: { providerID: "test", modelID: "test" },
    time: { created: Date.now() },
  } as unknown as MessageV2.Info)
  await svc.updatePart({
    id: PartID.ascending(),
    sessionID,
    messageID: message.id,
    type: "text",
    text,
  } as MessageV2.Part)
  return message
}

async function createAssistantMessage(sessionID: SessionID, parentID: MessageID, parts: string[]) {
  const message: MessageV2.Assistant = await svc.updateMessage({
    id: MessageID.ascending(),
    sessionID,
    role: "assistant",
    time: { created: Date.now() },
    parentID,
    modelID: "test",
    providerID: "test",
    mode: "build",
    agent: "build",
    finish: "stop",
    path: { cwd: "/tmp", root: "/tmp" },
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
  } as unknown as MessageV2.Assistant)

  for (const text of parts) {
    await svc.updatePart({
      id: PartID.ascending(),
      sessionID,
      messageID: message.id,
      type: "text",
      text,
    } as MessageV2.Part)
  }

  return message
}

describe("session wait route", () => {
  test("returns 400 for an invalid session id", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const app = Server.Default().app
        const response = await app.request("/session/not-a-session-id/wait", { method: "POST" })

        expect(response.status).toBe(400)
      },
    })
  })

  test("returns 404 for a missing session", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const app = Server.Default().app
        const response = await app.request("/session/ses_missing/wait", { method: "POST" })

        expect(response.status).toBe(404)
      },
    })
  })

  test("returns the final assistant message when the session is complete", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await svc.create({})
        const user = await createUserMessage(session.id, "hello")
        const assistant = await createAssistantMessage(session.id, user.id as MessageID, ["done"])

        const app = Server.Default().app
        const response = await app.request(`/session/${session.id}/wait`, { method: "POST" })
        const result = await response.json()

        expect(response.status).toBe(200)
        expect(result.info.id).toBe(assistant.id)
        expect(result.info.finish).toBe("stop")
        expect(result.parts).toHaveLength(1)
        expect(result.parts[0].text).toBe("done")

        await svc.remove(session.id)
      },
    })
  })

  test("returns assistant messages with multiple parts", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const session = await svc.create({})
        const user = await createUserMessage(session.id, "hello")
        await createAssistantMessage(session.id, user.id as MessageID, ["first", "second"])

        const app = Server.Default().app
        const response = await app.request(`/session/${session.id}/wait`, { method: "POST" })
        const result = await response.json()

        expect(response.status).toBe(200)
        expect(result.parts).toHaveLength(2)
        expect(result.parts[0].text).toBe("first")
        expect(result.parts[1].text).toBe("second")

        await svc.remove(session.id)
      },
    })
  })
})
