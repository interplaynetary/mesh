import fs from "fs"
import { Server } from "mock-socket"
import { describe, test, expect, afterAll } from "bun:test"
import Mesh from "../src/mesh"
import type { MeshAPI } from "../src/mesh"

describe("mesh.get", () => {
  const wss: Server = new Server("ws://localhost:9001")
  const mesh: MeshAPI = Mesh({ file: "test/mesh.get", wss: wss, maxAge: 100 })

  test("empty key callback null", async () => {
    const data = await new Promise(resolve => mesh.get("", resolve))
    expect(data).toBe(null)
  })

  test("null key callback null", async () => {
    const data = await new Promise(resolve => mesh.get(null, resolve))
    expect(data).toBe(null)
  })

  test("underscore as key callback null", async () => {
    const data = await new Promise(resolve => mesh.get("_", resolve))
    expect(data).toBe(null)
  })

  test("get unknown key callback null", async () => {
    const data = await new Promise(resolve => mesh.get("unknown", resolve))
    expect(data).toBe(null)
  })

  test("get unknown keys in for loop callbacks null", async () => {
    const promises = []
    for (let i = 0; i < 5; i++) {
      promises.push(new Promise(resolve => mesh.get("unknown" + i, resolve)))
    }
    await new Promise(resolve => setTimeout(resolve, 200))
    const results = await Promise.all(promises)
    for (const data of results) {
      expect(data).toBe(null)
    }
  })

  test("nested unknown keys both callbacks null", async () => {
    const data1 = await new Promise(resolve => mesh.get("unknown", resolve))
    expect(data1).toBe(null)

    const data2 = await new Promise(resolve => mesh.get("unknown", resolve))
    expect(data2).toBe(null)
  })

  test("get already called callback null", async () => {
    const data = await new Promise(resolve => mesh.get("chained").get("unknown", resolve))
    expect(data).toBe(null)
  })

  test("next chained unknown keys callback null", async () => {
    const data = await new Promise(resolve => mesh.get("chained").next("unknown", resolve))
    expect(data).toBe(null)
  })

  test("nested next chained unknown keys callback null", async () => {
    const data1 = await new Promise(resolve => mesh.get("chained").next("unknown", resolve))
    expect(data1).toBe(null)

    const data2 = await new Promise(resolve => mesh.get("chained").next("unknown", resolve))
    expect(data2).toBe(null)
  })

  afterAll(async () => {
    await fs.promises.rm("test/mesh.get", { recursive: true, force: true })
  })
})
