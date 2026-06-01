// ABOUTME: Verifies built-in local plugin names resolve without package installation.
// ABOUTME: Covers the Birdhouse plugin path used in bundled workspace builds.

import { afterAll, afterEach, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import fs from "fs/promises"
import path from "path"
import { tmpdir } from "../fixture/fixture"

const disableDefault = process.env.OPENCODE_DISABLE_DEFAULT_PLUGINS
process.env.OPENCODE_DISABLE_DEFAULT_PLUGINS = "1"

const { Plugin, loadBuiltinLocalPlugin } = await import("../../src/plugin/index")
const { Instance } = await import("../../src/project/instance")
const builtinPath = path.resolve(import.meta.dir, "../../src/plugin/birdhouse.ts")

afterEach(async () => {
  await Instance.disposeAll()
  await fs.rm(builtinPath, { force: true })
})

afterAll(() => {
  if (disableDefault === undefined) delete process.env.OPENCODE_DISABLE_DEFAULT_PLUGINS
  else process.env.OPENCODE_DISABLE_DEFAULT_PLUGINS = disableDefault
})

describe("plugin builtin local", () => {
  test("loads the bundled birdhouse module through the builtin helper", async () => {
    await Bun.write(
      builtinPath,
      [
        "export default async () => ({",
        '  "experimental.chat.system.transform": async (_input, output) => {',
        '    output.system.unshift("birdhouse")',
        "  },",
        "})",
        "",
      ].join("\n"),
    )

    const mod = await loadBuiltinLocalPlugin("birdhouse")
    expect(mod).toBeDefined()
    expect(typeof mod?.default).toBe("function")
  })

  test("loads the bundled birdhouse plugin by name", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(
          builtinPath,
          [
            "export default async () => ({",
            '  "experimental.chat.system.transform": async (_input, output) => {',
            '    output.system.unshift("birdhouse")',
            "  },",
            "})",
            "",
          ].join("\n"),
        )
        await Bun.write(
          path.join(dir, "opencode.json"),
          JSON.stringify({ $schema: "https://opencode.ai/config.json", plugin: ["birdhouse"] }, null, 2),
        )
      },
    })

    const output = await Instance.provide({
      directory: tmp.path,
      fn: async () =>
        Effect.gen(function* () {
          const plugin = yield* Plugin.Service
          const out = { system: [] as string[] }
          yield* plugin.trigger(
            "experimental.chat.system.transform",
            { model: { providerID: "anthropic", modelID: "claude-sonnet-4-6" } as any },
            out,
          )
          return out
        }).pipe(Effect.provide(Plugin.defaultLayer), Effect.runPromise),
    })

    expect(output.system).toEqual(["birdhouse"])
  })
})
