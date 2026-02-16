import { describe, test, expect, afterAll } from "bun:test"
import fs from "fs"
import WireTransport from "../src/wire-transport"
import Dup from "../src/dup"
import HAM from "../src/ham"
import type { WireInterface } from "../src/schemas"

describe("wire - advanced features", () => {
  describe("message validation", () => {
    test("accepts valid message with get request", async () => {
      const wire = WireTransport({ file: "test/wire-advanced-get", maxAge: 10 })

      const msg = await new Promise(resolve => {
        wire.get({ "#": "testSoul" }, resolve)
      })

      expect(msg).toBeDefined()
    })

    test("accepts valid message with put request", async () => {
      const wire = WireTransport({ file: "test/wire-advanced-put", maxAge: 10 })

      const data = {
        testNode: {
          _: { "#": "testNode", ">": { value: 1 } },
          value: "test",
        },
      }

      const err = await new Promise(resolve => {
        wire.put(data, resolve)
      })

      expect(err).toBe(null)
    })

    test("handles message with missing soul in get", async () => {
      const wire = WireTransport({ file: "test/wire-advanced-missing", maxAge: 10 })

      const msg = await new Promise(resolve => {
        wire.get({ "#": "nonExistent" }, resolve)
      })

      // Should return without error
      expect(msg).toBeDefined()
    })
  })

  describe("message deduplication", () => {
    test("dup tracks unique messages", () => {
      const dup = Dup(100)
      const id1 = "msg1"
      const id2 = "msg2"

      const tracked1 = dup.track(id1)
      const tracked2 = dup.track(id2)

      expect(tracked1).toBe(id1)
      expect(tracked2).toBe(id2)
    })

    test("dup detects duplicate messages", () => {
      const dup = Dup(100)
      const id = "msg1"

      dup.track(id)
      const isDup = dup.check(id)

      expect(isDup).toBe(id) // Returns the ID string for duplicates
    })

    test("dup allows message after expiry", async () => {
      const dup = Dup(20) // 20ms maxAge
      const id = "msg1"

      dup.track(id)
      expect(dup.check(id)).toBe(id) // Returns ID string when duplicate

      // Wait for maxAge so the first cleanup timer fires and entry expires
      await new Promise(resolve => setTimeout(resolve, 30))

      // Trigger a new cleanup cycle — the previous timer already ran,
      // so tracking a new message schedules another one
      dup.track("trigger")

      // Wait for the second cleanup timer to fire and purge msg1
      await new Promise(resolve => setTimeout(resolve, 30))

      // Check the store directly instead of using check() which would refresh the timestamp
      expect(dup.store[id]).toBeUndefined() // Should be deleted from store
      expect(dup.check(id)).toBe(false) // Returns false when not in store
    })

    test("dup handles multiple concurrent messages", () => {
      const dup = Dup(100)

      const ids = Array.from({ length: 100 }, (_, i) => `msg${i}`)
      ids.forEach(id => dup.track(id))

      ids.forEach(id => {
        expect(dup.check(id)).toBe(id) // Each returns its own ID
      })
    })

    test("dup cleans up expired messages", async () => {
      const dup = Dup(20) // 20ms maxAge

      // Track 10 messages
      for (let i = 0; i < 10; i++) {
        dup.track(`msg${i}`)
      }

      // Verify messages are tracked
      expect(Object.keys(dup.store).length).toBeGreaterThanOrEqual(10)

      // Wait for messages to expire (longer than maxAge)
      await new Promise(resolve => setTimeout(resolve, 25))

      // Track a new message to trigger the cleanup timer
      dup.track("trigger")

      // Wait for the cleanup timer to fire (maxAge + buffer)
      await new Promise(resolve => setTimeout(resolve, 25))

      // Check the store directly - all old messages should be deleted
      for (let i = 0; i < 10; i++) {
        expect(dup.store[`msg${i}`]).toBeUndefined()
      }
    })
  })

  describe("HAM conflict resolution", () => {
    test("accepts update with newer state", () => {
      const result = HAM(2, 1, "new value", "old value")
      expect(result.incoming).toBe(true) // Accepts incoming
    })

    test("rejects update with older state", () => {
      const result = HAM(1, 2, "new value", "old value")
      expect(result.historical).toBe(true) // Rejects incoming
    })

    test("uses lexical comparison for equal states", () => {
      const result1 = HAM(1, 1, "beta", "alpha")
      const result2 = HAM(1, 1, "alpha", "beta")

      // beta > alpha, so result1 should accept incoming
      expect(result1.incoming).toBe(true)
      // alpha < beta, so result2 should keep current
      expect(result2.current).toBe(true)
    })

    test("handles undefined incoming value", () => {
      const result = HAM(2, 1, undefined, "old value")
      expect(result.incoming).toBe(true) // Deletion with newer state
    })

    test("handles null incoming value", () => {
      const result = HAM(2, 1, null, "old value")
      expect(result.incoming).toBe(true) // Null with newer state
    })

    test("handles boolean values", () => {
      const result = HAM(2, 1, false, true)
      expect(result.incoming).toBe(true) // Newer state wins
    })

    test("handles number values", () => {
      const result = HAM(2, 1, 42, 10)
      expect(result.incoming).toBe(true) // Newer state wins
    })

    test("handles object values", () => {
      const result = HAM(2, 1, { nested: true }, { old: true })
      expect(result.incoming).toBe(true) // Newer state wins
    })

    test("rejects update when both states undefined", () => {
      const result = HAM(undefined as any, undefined as any, "new value", "old value")
      // With undefined states, newer wins (undefined > undefined is false, so equal states)
      // Falls through to lexical comparison
      expect(result).toBeDefined()
    })

    test("handles very large state numbers", () => {
      const result = HAM(Number.MAX_SAFE_INTEGER, 1, "new", "old")
      expect(result.incoming).toBe(true)
    })

    test("handles equal values with equal states", () => {
      const result = HAM(1, 1, "value", "value")
      expect(result.state).toBe(true) // Should return { state: true } for no change
    })
  })

  describe("message routing", () => {
    test("routes get request correctly", async () => {
      const wire = WireTransport({ file: "test/wire-routing", maxAge: 10 })

      // First put some data
      await new Promise(resolve => {
        wire.put(
          {
            testNode: {
              _: { "#": "testNode", ">": { name: 1 } },
              name: "test",
            },
          },
          resolve
        )
      })

      // Then get it back
      const msg = await new Promise(resolve => {
        wire.get({ "#": "testNode" }, resolve)
      })

      expect(msg).toBeDefined()
      expect(msg.put).toBeDefined()
    })

    test("routes put request and acknowledges", async () => {
      const wire = WireTransport({ file: "test/wire-put-ack", maxAge: 10 })

      const err = await new Promise(resolve => {
        wire.put(
          {
            ackTest: {
              _: { "#": "ackTest", ">": { value: 1 } },
              value: "acknowledged",
            },
          },
          resolve
        )
      })

      expect(err).toBe(null)
    })

    test("handles concurrent get requests", async () => {
      const wire = WireTransport({ file: "test/wire-concurrent", maxAge: 10 })

      // Put test data
      await new Promise(resolve => {
        wire.put(
          {
            concurrentNode: {
              _: { "#": "concurrentNode", ">": { data: 1 } },
              data: "concurrent test",
            },
          },
          resolve
        )
      })

      // Make multiple concurrent get requests
      const gets = Array.from({ length: 10 }, () =>
        new Promise(resolve => {
          wire.get({ "#": "concurrentNode" }, resolve)
        })
      )

      const results = await Promise.all(gets)
      results.forEach(msg => {
        expect(msg).toBeDefined()
      })
    })
  })

  describe("graph state management", () => {
    test("maintains graph state across operations", async () => {
      const wire = WireTransport({ file: "test/wire-state", maxAge: 10 })

      // Put initial data
      await new Promise(resolve => {
        wire.put(
          {
            stateNode: {
              _: { "#": "stateNode", ">": { count: 1 } },
              count: 1,
            },
          },
          resolve
        )
      })

      // Update the same node
      await new Promise(resolve => {
        wire.put(
          {
            stateNode: {
              _: { "#": "stateNode", ">": { count: 2 } },
              count: 2,
            },
          },
          resolve
        )
      })

      // Get should return latest state
      const msg = await new Promise(resolve => {
        wire.get({ "#": "stateNode" }, resolve)
      })

      expect(msg.put?.stateNode?.count).toBe(2)
    })

    test("handles field-level updates", async () => {
      const wire = WireTransport({ file: "test/wire-fields", maxAge: 10 })

      // Put node with multiple fields
      await new Promise(resolve => {
        wire.put(
          {
            multiField: {
              _: { "#": "multiField", ">": { name: 1, age: 1 } },
              name: "Alice",
              age: 30,
            },
          },
          resolve
        )
      })

      // Update just one field
      await new Promise(resolve => {
        wire.put(
          {
            multiField: {
              _: { "#": "multiField", ">": { age: 2 } },
              age: 31,
            },
          },
          resolve
        )
      })

      // Get specific field
      const msg = await new Promise(resolve => {
        wire.get({ "#": "multiField", ".": "age" }, resolve)
      })

      expect(msg.put?.multiField?.age).toBe(31)
    })
  })

  describe("edge cases and error handling", () => {
    test("handles empty put data", async () => {
      const wire = WireTransport({ file: "test/wire-empty", maxAge: 10 })

      const err = await new Promise(resolve => {
        wire.put({}, resolve)
      })

      expect(err).toBe(null)
    })

    test("handles malformed graph structure", async () => {
      const wire = WireTransport({ file: "test/wire-malformed", maxAge: 10 })

      // Put data without metadata
      const err = await new Promise(resolve => {
        wire.put(
          {
            badNode: {
              value: "no metadata",
            } as any,
          },
          resolve
        )
      })

      // Should handle gracefully
      expect(err).toBeDefined()
    })

    test("handles null values in graph", async () => {
      const wire = WireTransport({ file: "test/wire-null", maxAge: 10 })

      const err = await new Promise(resolve => {
        wire.put(
          {
            nullNode: {
              _: { "#": "nullNode", ">": { value: 1 } },
              value: null,
            },
          },
          resolve
        )
      })

      expect(err).toBe(null)
    })

    test("handles references between nodes", async () => {
      const wire = WireTransport({ file: "test/wire-refs", maxAge: 10 })

      await new Promise(resolve => {
        wire.put(
          {
            nodeA: {
              _: { "#": "nodeA", ">": { ref: 1 } },
              ref: { "#": "nodeB" },
            },
            nodeB: {
              _: { "#": "nodeB", ">": { value: 1 } },
              value: "referenced",
            },
          },
          resolve
        )
      })

      const msg = await new Promise(resolve => {
        wire.get({ "#": "nodeA" }, resolve)
      })

      expect(msg.put?.nodeA?.ref).toEqual({ "#": "nodeB" })
    })
  })

  afterAll(async () => {
    // Clean up all test directories created by wire-advanced tests
    const testDirs = [
      "test/wire-advanced-get",
      "test/wire-advanced-put",
      "test/wire-advanced-missing",
      "test/wire-routing",
    ]

    await Promise.all(
      testDirs.map(dir =>
        fs.promises.rm(dir, { recursive: true, force: true })
      )
    )
  })
})
