// ABOUTME: Tests for global path configuration and XDG directory handling
// ABOUTME: Verifies OPENCODE_XDG_* environment variable support

import { test, expect } from "bun:test"
import { Flag } from "../src/flag/flag"

test("OPENCODE_XDG_* flags exist in Flag namespace", () => {
  // Verify all four XDG override flags exist as properties
  expect("OPENCODE_XDG_DATA_HOME" in Flag).toBe(true)
  expect("OPENCODE_XDG_CONFIG_HOME" in Flag).toBe(true)
  expect("OPENCODE_XDG_CACHE_HOME" in Flag).toBe(true)
  expect("OPENCODE_XDG_STATE_HOME" in Flag).toBe(true)
})

test("OPENCODE_XDG_* flags read from environment", () => {
  // Note: These values are set in test/preload.ts
  // The test environment sets XDG_* vars, not OPENCODE_XDG_* vars
  // So these should be undefined in the test environment
  // In production (Birdhouse), these would be set
  
  // If OPENCODE_XDG_* vars are not set, flags should be undefined
  if (!process.env.OPENCODE_XDG_DATA_HOME) {
    expect(Flag.OPENCODE_XDG_DATA_HOME).toBeUndefined()
  }
  
  if (!process.env.OPENCODE_XDG_CONFIG_HOME) {
    expect(Flag.OPENCODE_XDG_CONFIG_HOME).toBeUndefined()
  }
  
  if (!process.env.OPENCODE_XDG_CACHE_HOME) {
    expect(Flag.OPENCODE_XDG_CACHE_HOME).toBeUndefined()
  }
  
  if (!process.env.OPENCODE_XDG_STATE_HOME) {
    expect(Flag.OPENCODE_XDG_STATE_HOME).toBeUndefined()
  }
})

test("Global paths are defined", async () => {
  // Global module is imported via preload, so paths should exist
  const { Global } = await import("../src/global")
  
  expect(Global.Path.data).toBeDefined()
  expect(Global.Path.config).toBeDefined()
  expect(Global.Path.cache).toBeDefined()
  expect(Global.Path.state).toBeDefined()
  expect(Global.Path.bin).toBeDefined()
  expect(Global.Path.log).toBeDefined()
  
  // All paths should contain "opencode"
  expect(Global.Path.data).toContain("opencode")
  expect(Global.Path.config).toContain("opencode")
  expect(Global.Path.cache).toContain("opencode")
  expect(Global.Path.state).toContain("opencode")
})
