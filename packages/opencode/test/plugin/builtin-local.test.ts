// ABOUTME: Verifies built-in local plugin names resolve without package installation.
// ABOUTME: Covers the Birdhouse plugin path used in bundled workspace builds.

import { afterAll, afterEach, describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EffectFlock } from "@opencode-ai/core/util/effect-flock"
import fs from "fs/promises"
import path from "path"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Config } from "../../src/config/config"
import { Env } from "../../src/env"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Plugin, loadBuiltinLocalPlugin } from "../../src/plugin/index"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { AccountTest } from "../fake/account"
import { AuthTest } from "../fake/auth"
import { NpmTest } from "../fake/npm"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"

const builtinPath = path.resolve(import.meta.dir, "../../src/plugin/birdhouse.ts")

const configLayer = Config.layer.pipe(
  Layer.provide(EffectFlock.defaultLayer),
  Layer.provide(FSUtil.defaultLayer),
  Layer.provide(Env.defaultLayer),
  Layer.provide(AuthTest.empty),
  Layer.provide(AccountTest.empty),
  Layer.provide(NpmTest.noop),
  Layer.provide(FetchHttpClient.layer),
)

const it = testEffect(
  Layer.mergeAll(
    Plugin.layer.pipe(
      Layer.provide(EventV2Bridge.defaultLayer),
      Layer.provide(configLayer),
      Layer.provide(RuntimeFlags.layer({ disableDefaultPlugins: true })),
    ),
    CrossSpawnSpawner.defaultLayer,
  ),
)

const birdhousePluginSource = [
  "export default async () => ({",
  '  "experimental.chat.system.transform": async (_input, output) => {',
  '    output.system.unshift("birdhouse")',
  "  },",
  "})",
  "",
].join("\n")

afterEach(async () => {
  await fs.rm(builtinPath, { force: true })
})

afterAll(async () => {
  await fs.rm(builtinPath, { force: true })
})

describe("plugin builtin local", () => {
  test("loads the bundled birdhouse module through the builtin helper", async () => {
    await Bun.write(builtinPath, birdhousePluginSource)

    const mod = await loadBuiltinLocalPlugin("birdhouse")
    expect(mod).toBeDefined()
    expect(typeof mod?.default).toBe("function")
  })

  it.instance(
    "loads the bundled birdhouse plugin by name",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => Bun.write(builtinPath, birdhousePluginSource))

        const test = yield* TestInstance
        yield* Effect.promise(() =>
          Bun.write(
            path.join(test.directory, "opencode.json"),
            JSON.stringify({ $schema: "https://opencode.ai/config.json", plugin: ["birdhouse"] }, null, 2),
          ),
        )

        const plugin = yield* Plugin.Service
        const out = { system: [] as string[] }
        yield* plugin.trigger(
          "experimental.chat.system.transform",
          { model: { providerID: ProviderV2.ID.opencode, modelID: ModelV2.ID.make("test") } as any },
          out,
        )
        expect(out.system).toEqual(["birdhouse"])
      }),
    { git: true },
  )
})
