// ABOUTME: Tests global path resolution for OPENCODE_XDG_* workspace overrides.
// ABOUTME: Verifies the global module reads override env vars when evaluated.

import { expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"

test("Global.Path uses OPENCODE_XDG_* overrides", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-xdg-"))
  const data = path.join(root, "data")
  const config = path.join(root, "config")
  const cache = path.join(root, "cache")
  const state = path.join(root, "state")
  const script = [
    `process.env.OPENCODE_XDG_DATA_HOME = ${JSON.stringify(data)}`,
    `process.env.OPENCODE_XDG_CONFIG_HOME = ${JSON.stringify(config)}`,
    `process.env.OPENCODE_XDG_CACHE_HOME = ${JSON.stringify(cache)}`,
    `process.env.OPENCODE_XDG_STATE_HOME = ${JSON.stringify(state)}`,
    `const mod = await import(${JSON.stringify(new URL("../src/global/index.ts", import.meta.url).href)})`,
    "console.log(JSON.stringify(mod.Path))",
  ].join("\n")

  try {
    const proc = Bun.spawn([process.execPath, "--eval", script], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    })
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    expect(code).toBe(0)
    expect(stderr).toBe("")

    const paths = JSON.parse(stdout.trim()) as Record<string, string>
    expect(paths.data).toBe(path.join(data, "opencode"))
    expect(paths.config).toBe(path.join(config, "opencode"))
    expect(paths.cache).toBe(path.join(cache, "opencode"))
    expect(paths.state).toBe(path.join(state, "opencode"))
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
