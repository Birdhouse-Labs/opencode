// ABOUTME: Exercises Session.fork behavior for user and assistant target messages.
// ABOUTME: Confirms forks exclude user targets but include assistant targets.

import { describe, expect } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import type { Assistant as AssistantMessage } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { Effect, Layer } from "effect"
import { Session as SessionNs } from "@/session/session"
import * as Log from "@opencode-ai/core/util/log"
import { MessageID } from "../../src/session/schema"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Storage } from "@/storage/storage"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { BackgroundJob } from "@/background/job"
import { EventV2Bridge } from "@/event-v2-bridge"

void Log.init({ print: false })

const it = testEffect(
  Layer.mergeAll(
    SessionNs.layer.pipe(
      Layer.provide(Storage.defaultLayer),
      Layer.provide(Database.defaultLayer),
      Layer.provideMerge(EventV2Bridge.defaultLayer),
      Layer.provide(SessionProjector.defaultLayer),
      Layer.provide(RuntimeFlags.layer({ experimentalWorkspaces: false })),
      Layer.provide(BackgroundJob.defaultLayer),
    ),
    CrossSpawnSpawner.defaultLayer,
    testInstanceStoreLayer,
  ),
)

describe("Session.fork", () => {
  it.instance("excludes the target when forking from a user message", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service

      const created = yield* Effect.acquireRelease(session.create({}), (info) =>
        session.remove(info.id).pipe(Effect.ignore),
      )

      const userMsgID = MessageID.ascending()
      yield* session.updateMessage({
        id: userMsgID,
        sessionID: created.id,
        role: "user",
        time: { created: Date.now() },
        agent: "user",
        model: { providerID: "test", modelID: "test" },
        tools: {},
        mode: "",
      } as unknown as SessionV1.Info)

      const assistantMsgID = MessageID.ascending()
      yield* session.updateMessage({
        id: assistantMsgID,
        sessionID: created.id,
        role: "assistant",
        parentID: userMsgID,
        time: { created: Date.now() },
        agent: "build",
        mode: "build",
        modelID: "test",
        providerID: "test",
        path: { cwd: "/tmp", root: "/tmp" },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      } as unknown as AssistantMessage)

      const user2MsgID = MessageID.ascending()
      yield* session.updateMessage({
        id: user2MsgID,
        sessionID: created.id,
        role: "user",
        time: { created: Date.now() },
        agent: "user",
        model: { providerID: "test", modelID: "test" },
        tools: {},
        mode: "",
      } as unknown as SessionV1.Info)

      const forked = yield* Effect.acquireRelease(
        session.fork({ sessionID: created.id, messageID: user2MsgID }),
        (info) => session.remove(info.id).pipe(Effect.ignore),
      )
      const msgs = yield* session.messages({ sessionID: forked.id })

      expect(msgs).toHaveLength(2)
      expect(msgs[0].info.role).toBe("user")
      expect(msgs[1].info.role).toBe("assistant")
    }),
    { git: true },
  )

  it.instance("includes the target when forking from an assistant message", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service

      const created = yield* Effect.acquireRelease(session.create({}), (info) =>
        session.remove(info.id).pipe(Effect.ignore),
      )

      const userMsgID = MessageID.ascending()
      yield* session.updateMessage({
        id: userMsgID,
        sessionID: created.id,
        role: "user",
        time: { created: Date.now() },
        agent: "user",
        model: { providerID: "test", modelID: "test" },
        tools: {},
        mode: "",
      } as unknown as SessionV1.Info)

      const assistantMsgID = MessageID.ascending()
      yield* session.updateMessage({
        id: assistantMsgID,
        sessionID: created.id,
        role: "assistant",
        parentID: userMsgID,
        time: { created: Date.now() },
        agent: "build",
        mode: "build",
        modelID: "test",
        providerID: "test",
        path: { cwd: "/tmp", root: "/tmp" },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      } as unknown as AssistantMessage)

      yield* session.updateMessage({
        id: MessageID.ascending(),
        sessionID: created.id,
        role: "user",
        time: { created: Date.now() },
        agent: "user",
        model: { providerID: "test", modelID: "test" },
        tools: {},
        mode: "",
      } as unknown as SessionV1.Info)

      const forked = yield* Effect.acquireRelease(
        session.fork({ sessionID: created.id, messageID: assistantMsgID }),
        (info) => session.remove(info.id).pipe(Effect.ignore),
      )
      const msgs = yield* session.messages({ sessionID: forked.id })

      expect(msgs).toHaveLength(2)
      expect(msgs[0].info.role).toBe("user")
      expect(msgs[1].info.role).toBe("assistant")
    }),
    { git: true },
  )
})
