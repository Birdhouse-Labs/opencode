// ABOUTME: Verifies the /llm/generate endpoint handles validation errors correctly.
// ABOUTME: Covers missing required fields and unknown agent names.

import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { describe, expect } from "bun:test"
import { Config, Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter, HttpServer } from "effect/unstable/http"
import * as Socket from "effect/unstable/socket/Socket"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { resetDatabase } from "../fixture/db"
import { tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const testStateLayer = Layer.effectDiscard(
  Effect.acquireRelease(
    Effect.promise(() => resetDatabase()),
    () => Effect.promise(() => resetDatabase()),
  ),
)

const servedRoutes: Layer.Layer<never, Config.ConfigError, HttpServer.HttpServer> = HttpRouter.serve(
  HttpApiApp.routes,
  { disableListenLog: true, disableLogger: true },
)

const httpApiServerLayer = servedRoutes.pipe(
  Layer.provide(Socket.layerWebSocketConstructorGlobal),
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provideMerge(NodeServices.layer),
)

const it = testEffect(Layer.mergeAll(testStateLayer, httpApiServerLayer))

const directoryHeader = (dir: string) => HttpClientRequest.setHeader("x-opencode-directory", dir)

describe("/llm/generate", () => {
  it.live(
    "returns 400 when message is missing",
    () =>
      Effect.gen(function* () {
        const tmp = yield* tmpdirScoped({ git: true })

        const response = yield* HttpClientRequest.post("/llm/generate").pipe(
          directoryHeader(tmp),
          HttpClientRequest.bodyJson({ prompt: "You are helpful." }),
          Effect.flatMap(HttpClient.execute),
        )

        expect(response.status).toBe(400)
      }),
  )

  it.live(
    "returns 400 when agent does not exist",
    () =>
      Effect.gen(function* () {
        const tmp = yield* tmpdirScoped({ git: true })

        const response = yield* HttpClientRequest.post("/llm/generate").pipe(
          directoryHeader(tmp),
          HttpClientRequest.bodyJson({ agent: "missing-agent-that-does-not-exist", message: "hello" }),
          Effect.flatMap(HttpClient.execute),
        )

        expect(response.status).toBe(400)
      }),
  )
})
