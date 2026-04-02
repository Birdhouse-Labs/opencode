// ABOUTME: Verifies skill reload refreshes skill-derived caches without disposing the instance.
// ABOUTME: Ensures agents, commands, and clients observe newly added skills after reload.

import { afterEach, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { GlobalBus } from "../../src/bus/global"
import { Command } from "../../src/command"
import { Instance } from "../../src/project/instance"
import { Permission } from "../../src/permission"
import { Server } from "../../src/server/server"
import { Skill } from "../../src/skill"
import { Agent } from "../../src/agent/agent"
import { tmpdir } from "../fixture/fixture"

afterEach(async () => {
  await Instance.disposeAll()
})

test(
  "skill reload refreshes skill-derived caches without disposing the instance",
  async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        const skillDir = path.join(dir, ".opencode", "skill", "first-skill")
        await fs.mkdir(skillDir, { recursive: true })
        await Bun.write(
          path.join(skillDir, "SKILL.md"),
          `---\nname: first-skill\ndescription: First skill.\n---\n\n# First Skill\n`,
        )
      },
    })

    const app = Server.Default().app
    const seen: { directory?: string; payload: { type: string } }[] = []
    const stateDisposed: string[] = []
    const customState = Instance.state(
      () => ({ id: Math.random().toString(36).slice(2) }),
      async (value) => {
        stateDisposed.push(value.id)
      },
    )
    const listener = (evt: { directory?: string; payload: { type: string } }) => {
      seen.push(evt)
    }
    GlobalBus.on("event", listener)

    try {
      const before = await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          await Skill.all()
          await Command.list()
          return customState()
        },
      })

      const secondDir = path.join(tmp.path, ".opencode", "skill", "second-skill")
      await fs.mkdir(secondDir, { recursive: true })
      await Bun.write(
        path.join(secondDir, "SKILL.md"),
        `---\nname: second-skill\ndescription: Second skill.\n---\n\n# Second Skill\n`,
      )

      const response = await app.request("/skill/reload", {
        method: "POST",
        headers: { "x-opencode-directory": tmp.path },
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toBe(true)
      expect(seen.some((evt) => evt.directory === tmp.path && evt.payload.type === "server.skills.reloaded")).toBe(true)
      expect(seen.some((evt) => evt.directory === tmp.path && evt.payload.type === "server.instance.disposed")).toBe(false)

      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const after = customState()
          const skills = await Skill.all()
          const command = await Command.get("second-skill")
          const build = await Agent.get("build")
          const action = Permission.evaluate(
            "external_directory",
            path.join(secondDir, "notes.txt"),
            build!.permission,
          ).action

          expect(after).toBe(before)
          expect(stateDisposed).toEqual([])
          expect(skills.map((skill) => skill.name).sort()).toEqual(["first-skill", "second-skill"])
          expect(command?.source).toBe("skill")
          expect(action).toBe("allow")
        },
      })
    } finally {
      GlobalBus.off("event", listener)
    }
  },
  { timeout: 30000 },
)
