import { afterEach, describe, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { Effect, Layer } from "effect"
import { Agent } from "../../src/agent/agent"
import { Permission } from "../../src/permission"
import { Instance } from "../../src/project/instance"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { ToolRegistry } from "../../src/tool"
import { AppRuntime } from "../../src/effect/app-runtime"
import { provideTmpdirInstance, tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const node = CrossSpawnSpawner.defaultLayer

const it = testEffect(Layer.mergeAll(ToolRegistry.defaultLayer, node))

afterEach(async () => {
  await Instance.disposeAll()
})

describe("tool.registry", () => {
  test("keeps task registered by default", async () => {
    const previousConfigContent = process.env.OPENCODE_CONFIG_CONTENT
    const previousPermission = process.env.OPENCODE_PERMISSION
    delete process.env.OPENCODE_CONFIG_CONTENT
    delete process.env.OPENCODE_PERMISSION

    await using tmp = await tmpdir({ git: true })

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const ids = await AppRuntime.runPromise(ToolRegistry.Service.use((r) => r.ids()))
          expect(ids).toContain("task")
        },
      })
    } finally {
      if (previousConfigContent === undefined) delete process.env.OPENCODE_CONFIG_CONTENT
      else process.env.OPENCODE_CONFIG_CONTENT = previousConfigContent
      if (previousPermission === undefined) delete process.env.OPENCODE_PERMISSION
      else process.env.OPENCODE_PERMISSION = previousPermission
    }
  })

  test("marks task disabled for agents when config disables it", async () => {
    const previousConfigContent = process.env.OPENCODE_CONFIG_CONTENT
    const previousPermission = process.env.OPENCODE_PERMISSION
    delete process.env.OPENCODE_CONFIG_CONTENT
    delete process.env.OPENCODE_PERMISSION

    await using tmp = await tmpdir({
      git: true,
      config: {
        tools: {
          task: false,
        },
      },
    })

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const agent = await AppRuntime.runPromise(Agent.Service.use((svc) => svc.get("build")))
          const ids = await AppRuntime.runPromise(ToolRegistry.Service.use((r) => r.ids()))
          const disabled = Permission.disabled(ids, agent!.permission)

          expect(disabled.has("task")).toBe(true)
        },
      })
    } finally {
      if (previousConfigContent === undefined) delete process.env.OPENCODE_CONFIG_CONTENT
      else process.env.OPENCODE_CONFIG_CONTENT = previousConfigContent
      if (previousPermission === undefined) delete process.env.OPENCODE_PERMISSION
      else process.env.OPENCODE_PERMISSION = previousPermission
    }
  })

  it.live("loads tools from .opencode/tool (singular)", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const opencode = path.join(dir, ".opencode")
        const tool = path.join(opencode, "tool")
        yield* Effect.promise(() => fs.mkdir(tool, { recursive: true }))
        yield* Effect.promise(() =>
          Bun.write(
            path.join(tool, "hello.ts"),
            [
              "export default {",
              "  description: 'hello tool',",
              "  args: {},",
              "  execute: async () => {",
              "    return 'hello world'",
              "  },",
              "}",
              "",
            ].join("\n"),
          ),
        )
        const registry = yield* ToolRegistry.Service
        const ids = yield* registry.ids()
        expect(ids).toContain("hello")
      }),
    ),
  )

  it.live("loads tools from .opencode/tools (plural)", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const opencode = path.join(dir, ".opencode")
        const tools = path.join(opencode, "tools")
        yield* Effect.promise(() => fs.mkdir(tools, { recursive: true }))
        yield* Effect.promise(() =>
          Bun.write(
            path.join(tools, "hello.ts"),
            [
              "export default {",
              "  description: 'hello tool',",
              "  args: {},",
              "  execute: async () => {",
              "    return 'hello world'",
              "  },",
              "}",
              "",
            ].join("\n"),
          ),
        )
        const registry = yield* ToolRegistry.Service
        const ids = yield* registry.ids()
        expect(ids).toContain("hello")
      }),
    ),
  )

  it.live("loads tools with external dependencies without crashing", () =>
    provideTmpdirInstance((dir) =>
      Effect.gen(function* () {
        const opencode = path.join(dir, ".opencode")
        const tools = path.join(opencode, "tools")
        yield* Effect.promise(() => fs.mkdir(tools, { recursive: true }))
        yield* Effect.promise(() =>
          Bun.write(
            path.join(opencode, "package.json"),
            JSON.stringify({
              name: "custom-tools",
              dependencies: {
                "@opencode-ai/plugin": "^0.0.0",
                cowsay: "^1.6.0",
              },
            }),
          ),
        )
        yield* Effect.promise(() =>
          Bun.write(
            path.join(opencode, "package-lock.json"),
            JSON.stringify({
              name: "custom-tools",
              lockfileVersion: 3,
              packages: {
                "": {
                  dependencies: {
                    "@opencode-ai/plugin": "^0.0.0",
                    cowsay: "^1.6.0",
                  },
                },
              },
            }),
          ),
        )

        const cowsay = path.join(opencode, "node_modules", "cowsay")
        yield* Effect.promise(() => fs.mkdir(cowsay, { recursive: true }))
        yield* Effect.promise(() =>
          Bun.write(
            path.join(cowsay, "package.json"),
            JSON.stringify({
              name: "cowsay",
              type: "module",
              exports: "./index.js",
            }),
          ),
        )
        yield* Effect.promise(() =>
          Bun.write(
            path.join(cowsay, "index.js"),
            ["export function say({ text }) {", "  return `moo ${text}`", "}", ""].join("\n"),
          ),
        )
        yield* Effect.promise(() =>
          Bun.write(
            path.join(tools, "cowsay.ts"),
            [
              "import { say } from 'cowsay'",
              "export default {",
              "  description: 'tool that imports cowsay at top level',",
              "  args: { text: { type: 'string' } },",
              "  execute: async ({ text }: { text: string }) => {",
              "    return say({ text })",
              "  },",
              "}",
              "",
            ].join("\n"),
          ),
        )
        const registry = yield* ToolRegistry.Service
        const ids = yield* registry.ids()
        expect(ids).toContain("cowsay")
      }),
    ),
  )
})
