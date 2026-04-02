import { afterEach, describe, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { tmpdir } from "../fixture/fixture"
import { Agent } from "../../src/agent/agent"
import { Permission } from "../../src/permission"
import { Instance } from "../../src/project/instance"
import { ToolRegistry } from "../../src/tool/registry"

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
          const ids = await ToolRegistry.ids()
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
          const agent = await Agent.get("build")
          const ids = await ToolRegistry.ids()
          const disabled = Permission.disabled(ids, agent.permission)

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

  test("loads tools from .opencode/tool (singular)", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const opencodeDir = path.join(dir, ".opencode")
        await fs.mkdir(opencodeDir, { recursive: true })

        const toolDir = path.join(opencodeDir, "tool")
        await fs.mkdir(toolDir, { recursive: true })

        await Bun.write(
          path.join(toolDir, "hello.ts"),
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
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const ids = await ToolRegistry.ids()
        expect(ids).toContain("hello")
      },
    })
  })

  test("loads tools from .opencode/tools (plural)", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const opencodeDir = path.join(dir, ".opencode")
        await fs.mkdir(opencodeDir, { recursive: true })

        const toolsDir = path.join(opencodeDir, "tools")
        await fs.mkdir(toolsDir, { recursive: true })

        await Bun.write(
          path.join(toolsDir, "hello.ts"),
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
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const ids = await ToolRegistry.ids()
        expect(ids).toContain("hello")
      },
    })
  })

  test("loads tools with external dependencies without crashing", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const opencodeDir = path.join(dir, ".opencode")
        await fs.mkdir(opencodeDir, { recursive: true })

        const toolsDir = path.join(opencodeDir, "tools")
        await fs.mkdir(toolsDir, { recursive: true })

        await Bun.write(
          path.join(opencodeDir, "package.json"),
          JSON.stringify({
            name: "custom-tools",
            dependencies: {
              "@opencode-ai/plugin": "^0.0.0",
              cowsay: "^1.6.0",
            },
          }),
        )

        await Bun.write(
          path.join(opencodeDir, "package-lock.json"),
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
        )

        const cowsayDir = path.join(opencodeDir, "node_modules", "cowsay")
        await fs.mkdir(cowsayDir, { recursive: true })
        await Bun.write(
          path.join(cowsayDir, "package.json"),
          JSON.stringify({
            name: "cowsay",
            type: "module",
            exports: "./index.js",
          }),
        )
        await Bun.write(
          path.join(cowsayDir, "index.js"),
          ["export function say({ text }) {", "  return `moo ${text}`", "}", ""].join("\n"),
        )

        await Bun.write(
          path.join(toolsDir, "cowsay.ts"),
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
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const ids = await ToolRegistry.ids()
        expect(ids).toContain("cowsay")
      },
    })
  })
})
