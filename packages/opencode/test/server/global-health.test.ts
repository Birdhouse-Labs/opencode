// ABOUTME: Verifies the global health route exposes Birdhouse workspace metadata.
// ABOUTME: Ensures the response remains stable when the env var is missing or set.

import { afterEach, describe, expect, test } from "bun:test"
import { GlobalRoutes } from "../../src/server/routes/global"

afterEach(() => {
  delete process.env.BIRDHOUSE_WORKSPACE_ID
})

describe("global health route", () => {
  test("returns null when BIRDHOUSE_WORKSPACE_ID is unset", async () => {
    const app = GlobalRoutes()
    const response = await app.request("/health")
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.birdhouseWorkspaceId).toBeNull()
  })

  test("returns the Birdhouse workspace id when present", async () => {
    process.env.BIRDHOUSE_WORKSPACE_ID = "ws_123"

    const app = GlobalRoutes()
    const response = await app.request("/health")
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.birdhouseWorkspaceId).toBe("ws_123")
  })
})
