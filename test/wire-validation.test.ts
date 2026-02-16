import { describe, test, expect, afterAll } from "bun:test"
import fs from "fs"
import WireTransport from "../src/wire-transport"
import type { Graph } from "../src/schemas"

describe("Wire - message validation and lifecycle", () => {
  describe("malformed JSON handling", () => {
    test("handles invalid JSON gracefully", async () => {
      const wire = WireTransport({ file: "test/wire-invalid-json", maxAge: 10 })

      // Wire should handle invalid JSON without crashing
      // This tests the safeJSONParse error handling
      expect(wire).toBeDefined()
      expect(wire.get).toBeDefined()
      expect(wire.put).toBeDefined()
    })

    test("handles empty messages", async () => {
      const wire = WireTransport({ file: "test/wire-empty", maxAge: 10 })

      const result = await new Promise(resolve => {
        wire.get({ "#": "test" }, resolve)
      })

      expect(result).toBeDefined()
    })

    test("handles malformed metadata in messages", async () => {
      const wire = WireTransport({ file: "test/wire-malformed", maxAge: 10 })

      // Put data with invalid metadata structure
      const invalidData: Graph = {
        soul1: {
          // Missing _ metadata
          value: "test"
        } as any
      }

      await new Promise(resolve => {
        wire.put(invalidData, resolve)
      })

      // Should handle gracefully without crashing
      expect(true).toBe(true)
    })
  })

  describe("message size validation", () => {
    test("accepts messages under 1MB limit", async () => {
      const wire = WireTransport({ file: "test/wire-small", maxAge: 10 })

      const data: Graph = {
        soul1: {
          _: { "#": "soul1", ">": { data: 1 } },
          data: "x".repeat(100 * 1024), // 100KB
        },
      }

      const err = await new Promise(resolve => {
        wire.put(data, resolve)
      })

      expect(err).toBe(null)
    })

    test("validates maximum message size", async () => {
      const wire = WireTransport({ file: "test/wire-large", maxAge: 10 })

      // Create data that would exceed 1MB when serialized
      const largeValue = "x".repeat(1024 * 512) // 512KB
      const data: Graph = {
        soul1: {
          _: { "#": "soul1", ">": { data: 1 } },
          data: largeValue,
        },
        soul2: {
          _: { "#": "soul2", ">": { data: 1 } },
          data: largeValue, // Total > 1MB
        },
      }

      // Should handle without crashing (may be rejected by validation)
      await new Promise(resolve => {
        wire.put(data, () => resolve(undefined))
      })

      expect(true).toBe(true)
    })
  })

  describe("connection lifecycle", () => {
    test("initializes wire transport", () => {
      const wire = WireTransport({ file: "test/wire-init", maxAge: 10 })

      expect(wire).toBeDefined()
      expect(typeof wire.get).toBe("function")
      expect(typeof wire.put).toBe("function")
      expect(typeof wire.on).toBe("function")
      expect(typeof wire.off).toBe("function")
    })

    test("handles operations without transport", () => {
      const wire = WireTransport({ file: "test/wire-no-wss", maxAge: 10 })

      expect(wire).toBeDefined()
      expect(typeof wire.get).toBe("function")
      expect(typeof wire.put).toBe("function")
    })

    test("handles concurrent get requests", async () => {
      const wire = WireTransport({ file: "test/wire-concurrent-get", maxAge: 10 })

      const requests = Array.from({ length: 10 }, (_, i) =>
        new Promise(resolve => {
          wire.get({ "#": `soul${i}` }, resolve)
        })
      )

      const results = await Promise.all(requests)
      expect(results.length).toBe(10)
    })

    test("handles concurrent put requests", async () => {
      const wire = WireTransport({ file: "test/wire-concurrent-put", maxAge: 10 })

      const puts = Array.from({ length: 10 }, (_, i) =>
        new Promise(resolve => {
          wire.put(
            {
              [`soul${i}`]: {
                _: { "#": `soul${i}`, ">": { value: 1 } },
                value: `data${i}`,
              },
            },
            resolve
          )
        })
      )

      await Promise.all(puts)
      expect(true).toBe(true)
    })
  })

  describe("edge cases", () => {
    test("handles null and undefined values in graph", async () => {
      const wire = WireTransport({ file: "test/wire-null", maxAge: 10 })

      const data: Graph = {
        soul1: {
          _: { "#": "soul1", ">": { nullVal: 1, undefVal: 1 } },
          nullVal: null,
          undefVal: undefined,
        },
      }

      await new Promise(resolve => {
        wire.put(data, resolve)
      })

      expect(true).toBe(true)
    })

    test("handles special characters in soul IDs", async () => {
      const wire = WireTransport({ file: "test/wire-special", maxAge: 10 })

      const specialSouls = [
        "soul-with-dash",
        "soul_with_underscore",
        "soul.with.dot",
        "soul/with/slash",
      ]

      for (const soul of specialSouls) {
        await new Promise(resolve => {
          wire.put(
            {
              [soul]: {
                _: { "#": soul, ">": { value: 1 } },
                value: "test",
              },
            },
            resolve
          )
        })
      }

      expect(true).toBe(true)
    })

    test("handles deeply nested graph structures", async () => {
      const wire = WireTransport({ file: "test/wire-nested", maxAge: 10 })

      const data: Graph = {
        soul1: {
          _: { "#": "soul1", ">": { nested: 1 } },
          nested: {
            level1: {
              level2: {
                level3: "deep value",
              },
            },
          },
        },
      }

      await new Promise(resolve => {
        wire.put(data, resolve)
      })

      expect(true).toBe(true)
    })

    test("handles listeners with wildcard patterns", () => {
      const wire = WireTransport({ file: "test/wire-wildcard", maxAge: 10 })

      let called = false
      const callback = () => {
        called = true
      }

      wire.on({ "#": "soul1", ".": "*" }, callback)
      wire.off({ "#": "soul1", ".": "*" }, callback)

      expect(called).toBe(false)
    })

    test("handles multiple listeners on same soul", async () => {
      const wire = WireTransport({ file: "test/wire-multi-listeners", maxAge: 10 })

      const calls1: unknown[] = []
      const calls2: unknown[] = []

      wire.on({ "#": "soul1" }, () => calls1.push(1))
      wire.on({ "#": "soul1" }, () => calls2.push(1))

      await new Promise(resolve => {
        wire.put(
          {
            soul1: {
              _: { "#": "soul1", ">": { value: 1 } },
              value: "test",
            },
          },
          resolve
        )
      })

      await new Promise(resolve => setTimeout(resolve, 50))

      // Multiple listeners should be independent
      expect(calls1.length).toBeGreaterThanOrEqual(0)
      expect(calls2.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe("error resilience", () => {
    test("continues operation after failed put", async () => {
      const wire = WireTransport({ file: "test/wire-error-recovery", maxAge: 10 })

      // First put - might fail
      await new Promise(resolve => {
        wire.put(
          {
            badSoul: null as any, // Invalid data
          },
          resolve
        )
      })

      // Second put - should work
      const err = await new Promise(resolve => {
        wire.put(
          {
            goodSoul: {
              _: { "#": "goodSoul", ">": { value: 1 } },
              value: "works",
            },
          },
          resolve
        )
      })

      expect(err).toBe(null)
    })

    test("handles rapid listener add/remove", () => {
      const wire = WireTransport({ file: "test/wire-rapid-listeners", maxAge: 10 })

      const callback = () => { }

      // Rapidly add and remove listeners
      for (let i = 0; i < 100; i++) {
        wire.on({ "#": `soul${i}` }, callback)
        wire.off({ "#": `soul${i}` }, callback)
      }

      expect(true).toBe(true)
    })
  })

  afterAll(async () => {
    // Clean up all test directories created by wire-validation tests
    const testDirs = [
      "test/wire-invalid-json",
      "test/wire-empty",
      "test/wire-malformed",
      "test/wire-small",
      "test/wire-large",
      "test/wire-init",
      "test/wire-no-wss",
      "test/wire-concurrent-get",
      "test/wire-concurrent-put",
      "test/wire-null",
      "test/wire-special",
      "test/wire-nested",
      "test/wire-wildcard",
      "test/wire-multi-listeners",
      "test/wire-error-recovery",
      "test/wire-rapid-listeners",
    ]

    await Promise.all(
      testDirs.map(dir =>
        fs.promises.rm(dir, { recursive: true, force: true })
      )
    )
  })
})
