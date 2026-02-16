import fs from "fs"
import { describe, test, expect, afterAll } from "bun:test"
import WireTransport from "../src/wire-transport"
import type { WireInterface } from "../src/schemas"
import type { Transport } from "../src/transport"

/** Create a mock transport that simulates a remote peer responding to GET requests */
const createMockTransport = (): Transport & { _simulateMessage: (data: string) => void } => {
  let messageCallback: ((data: string, peerId?: string) => void) | null = null
  let openCallback: (() => void) | null = null
  let connected = true

  const transport: Transport & { _simulateMessage: (data: string) => void } = {
    connect: async () => { connected = true; openCallback?.() },
    disconnect: async () => { connected = false },
    isConnected: () => connected,
    send: async (data: string) => {
      // Simulate a remote peer: parse the message and respond to GETs
      const msg = JSON.parse(data)
      if (msg.get) {
        const soul = msg.get["#"]
        const put: Record<string, unknown> = {
          [soul]: {
            _: { "#": soul, ">": { test: 1 } },
            test: "property",
          },
        }
        let track = "item"
        if (!msg.get["."]) {
          const node = put[soul]! as any
          node._[">"].other = 2
          node.other = "value"
          track = "node"
        }
        // Respond asynchronously like a real network would
        setTimeout(() => {
          messageCallback?.(JSON.stringify({
            "#": track,
            "@": msg["#"],
            put: put,
          }))
        }, 10)
      }
    },
    onMessage: (cb) => { messageCallback = cb },
    onError: () => {},
    onClose: () => {},
    onOpen: (cb) => { openCallback = cb },
    _simulateMessage: (data: string) => { messageCallback?.(data) },
  }
  return transport
}

describe("wire", () => {
  const kitty: WireInterface = WireTransport({ file: "test/kitty", maxAge: 10 })

  const mockTransport = createMockTransport()
  const wire: WireInterface = WireTransport({ file: "test/wire", transport: mockTransport, maxAge: 10 })

  test("get node", async () => {
    // Wait for wire to initialize and load data from disk
    await new Promise(resolve => setTimeout(resolve, 100))
    const msg = await new Promise(resolve => {
      kitty.get({ "#": "FDSA" }, resolve)
    })
    expect(msg).toEqual({
      err: undefined,
      put: {
        FDSA: {
          _: {
            "#": "FDSA",
            ">": {
              color: 3,
              name: 2,
              slave: 2,
              species: 2,
            },
          },
          color: "ginger",
          name: "Fluffy",
          slave: { "#": "ASDF" },
          species: "felis silvestris",
        },
      },
    })
  })

  test("get item", async () => {
    // Wait for wire to initialize and load data from disk
    await new Promise(resolve => setTimeout(resolve, 100))
    const msg = await new Promise(resolve => {
      kitty.get({ "#": "FDSA", ".": "species" }, resolve)
    })
    expect(msg).toEqual({
      err: undefined,
      put: {
        FDSA: {
          _: {
            "#": "FDSA",
            ">": { species: 2 },
          },
          species: "felis silvestris",
        },
      },
    })
  })

  test("get node from wire", async () => {
    const msg = await new Promise(resolve => {
      wire.get({ "#": "not on disk" }, resolve)
    })
    expect(msg).toEqual({
      put: {
        "not on disk": {
          _: {
            "#": "not on disk",
            ">": { test: 1, other: 2 },
          },
          test: "property",
          other: "value",
        },
      },
    })
  })

  test("get item from wire", async () => {
    const msg = await new Promise(resolve => {
      wire.get({ "#": "not on disk", ".": "test" }, resolve)
    })
    expect(msg).toEqual({
      put: {
        "not on disk": {
          _: {
            "#": "not on disk",
            ">": { test: 1 },
          },
          test: "property",
        },
      },
    })
  })

  test("put and get new node", async () => {
    const update = {
      key: {
        _: { "#": "key", ">": { value: 1, otherValue: 1 } },
        value: "wire test",
        otherValue: false,
      },
    }
    const err = await new Promise(resolve => {
      wire.put(update, resolve)
    })
    expect(err).toBe(null)

    const msg = await new Promise(resolve => {
      wire.get({ "#": "key", ".": "value" }, resolve)
    })
    expect(msg).toEqual({
      put: {
        key: {
          _: {
            "#": "key",
            ">": { value: 1 },
          },
          value: "wire test",
        },
      },
    })
  })

  afterAll(async () => {
    // Timeout to let extra wire sends finish before cleanup
    await new Promise(resolve => setTimeout(resolve, 100))
    await fs.promises.rm("test/wire", { recursive: true, force: true })
  })
})
