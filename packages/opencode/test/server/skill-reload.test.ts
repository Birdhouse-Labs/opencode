// ABOUTME: Verifies skill reload endpoint returns success without disposing the instance.
// ABOUTME: Ensures POST /skill/reload responds with 200 and true.

import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { describe, expect } from "bun:test"
import { Config, Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter, HttpServer } from "effect/unstable/http"
import * as Socket from "effect/unstable/socket/Socket"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { InstancePaths } from "../../src/server/routes/instance/httpapi/groups/instance"
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

describe("skill reload", () => {
  it.live(
    "POST /skill/reload returns 200",
    () =>
      Effect.gen(function* () {
        const tmp = yield* tmpdirScoped({ git: true })

        // Bootstrap the instance by listing skills
        const initial = yield* HttpClientRequest.get(InstancePaths.skill).pipe(
          directoryHeader(tmp),
          HttpClient.execute,
        )
        expect(initial.status).toBe(200)

        // Trigger reload — should succeed without disposing the instance
        const reloadResponse = yield* HttpClientRequest.post(InstancePaths.skillReload).pipe(
          directoryHeader(tmp),
          HttpClient.execute,
        )
        expect(reloadResponse.status).toBe(200)
        expect(yield* reloadResponse.json).toBe(true)

        // Instance should still be alive after reload — can list skills again
        const after = yield* HttpClientRequest.get(InstancePaths.skill).pipe(
          directoryHeader(tmp),
          HttpClient.execute,
        )
        expect(after.status).toBe(200)
      }),
    { timeout: 30000 },
  )
})
