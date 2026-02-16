/**
 * Wire Transport - Elegant transport-agnostic wire protocol
 * Full-featured implementation with rate limiting, validation, and queue management
 */

import Dup from "./dup.js"
import Get from "./get.js"
import Ham from "./ham.js"
import Store from "./store.js"
import * as utils from "./utils.js"
import type {
    Graph,
    WireMessage,
    WireOptions,
    Lex,
    ListenMap,
    MeshOptions,
    GraphValue,
} from "./schemas.js"
import type { Transport, TransportServer } from "./transport.js"
import FingerTable from "./fingertable.js"

// ============================================================================
// Types
// ============================================================================

export interface WireAPI {
    get: (lex: Lex, cb: (msg: WireMessage) => void, _opt?: WireOptions) => void
    put: (data: Graph, cb?: (err?: string | null) => void) => Promise<void> | void
    on: (lex: Lex, cb: () => void, _get?: boolean, _opt?: WireOptions) => void
    off: (lex: Lex, cb: () => void) => void
}

export interface WireTransportOptions extends MeshOptions {
    transport?: Transport
    transports?: Transport[]
    transportServer?: TransportServer
}

// ============================================================================
// Utilities
// ============================================================================

/** Rate limiter for controlling message flow */
const createRateLimiter = (isTestEnv: boolean) => {
    const clients = new Map<string, { requests: number[]; lastCleanup: number; throttleCount: number }>()
    const maxRequests = 1500
    const windowMs = 60000

    if (!isTestEnv) {
        setInterval(() => {
            const now = Date.now()
            for (const [_, data] of clients) {
                data.requests = data.requests.filter(time => now - time < windowMs)
                if (now - data.lastCleanup > windowMs * 10) data.throttleCount = 0
            }
        }, windowMs / 4)
    }

    return {
        getDelay: (clientId: string): number => {
            const now = Date.now()
            const client = clients.get(clientId) || { requests: [], lastCleanup: now, throttleCount: 0 }
            client.requests = client.requests.filter(time => now - time < windowMs)

            if (client.requests.length >= maxRequests) {
                const delay = windowMs - (now - Math.min(...client.requests))
                client.throttleCount++
                clients.set(clientId, client)
                return Math.max(0, delay)
            }

            client.requests.push(now)
            clients.set(clientId, client)
            return 0
        },
        shouldDisconnect: (clientId: string): boolean => {
            const client = clients.get(clientId)
            return client ? client.throttleCount >= 10 : false
        },
    }
}

/** Message validator */
const validateMessage = (data: string | Buffer | ArrayBuffer | Uint8Array, maxSize = 10 * 1024 * 1024) => {
    if (typeof data === "string" && data.length > maxSize) {
        return { valid: false, error: "Message too large" }
    }
    if (typeof Buffer !== "undefined" && Buffer.isBuffer?.(data) && data.length > maxSize) {
        return { valid: false, error: "Message too large" }
    }
    return { valid: true }
}

/** Message queue processor with throttling */
const createMessageQueue = (sendFn: (data: string) => void, maxQueueLength = 1000) => {
    const queue: string[] = []
    let processing = false

    const process = async () => {
        if (processing || queue.length === 0) return
        processing = true

        while (queue.length > 0) {
            const msg = queue.shift()!
            sendFn(msg)
            await new Promise(resolve => setTimeout(resolve, 10))
        }

        processing = false
    }

    return {
        enqueue: (data: string): { err?: string } | void => {
            if (queue.length >= maxQueueLength) {
                return { err: `Message queue exceeded maximum length (${maxQueueLength})` }
            }
            queue.push(data)
            process()
        },
        size: () => queue.length,
        flush: () => process(),
    }
}

// ============================================================================
// Wire Transport
// ============================================================================

const WireTransport = (opt: WireTransportOptions): WireAPI => {
    const options = opt || {}
    const dup = Dup(options.maxAge)
    const store = Store(options as never)
    const graph: Graph = {}
    const queue: Record<string, (msg: WireMessage) => void> = {}
    const listen: ListenMap = {}
    const pendingReferences = new Set<string>()

    // Initialize FingerTable with our public key (assuming options.secure is enabled or we have a key? 
    // Actually we don't have user identity here easily unless passed. 
    // WireTransport is generic. But FingerTable needs ID.
    // We'll generate a random ID if not provided, or use a placeholder until connected methods provide identity.
    // Ideally user.pub should be passed in opt. But schemas says MeshOptions has no user.
    // Typically Wire receives a MeshOptions which might have a 'id' or we derive from transport?
    // Let's assume a random ID for now if not present, but for routing to work we need STABLE ID.
    // 'utils.random()' or similar.
    const selfId = utils.text.random(20)
    const fingerTable = FingerTable(selfId)

    // Utilities
    const isTestEnv = !!(options.wss || options.transportServer)
    const rateLimiter = createRateLimiter(isTestEnv)

    const hasSoul = async (soul: string): Promise<boolean> => {
        if (graph[soul]) return true
        return new Promise(resolve => {
            store.get({ "#": soul }, (err, data) => resolve(!err && !!data && !!data[soul]))
        })
    }

    // ============================================================================
    // Protocol Handlers
    // ============================================================================

    const check = async (
        data: Graph,
        send: (msg: string) => { err?: string } | void,
        cb?: (err?: string | null) => void
    ): Promise<boolean> => {
        const key = utils.userPublicKey

        for (const soul of Object.keys(data)) {
            const msg = await new Promise<WireMessage>(res => getWithCallback({ "#": soul, ".": key }, res, send))
            if (msg.err) {
                cb?.(msg.err)
                return false
            }

            const node = data[soul]!
            if (!msg.put || !msg.put[soul] || node[key] === undefined || msg.put[soul]![key] === node[key]) {
                continue
            }

            cb?.(`error in wire check public key does not match for soul: ${soul}`)
            return false
        }

        return true
    }

    const handleGet = (msg: { get: Lex; "#": string }, send: (msg: string) => void): void => {
        const ack = Get(msg.get, graph)
        const respond = (put?: Graph, err?: string) => {
            send(JSON.stringify({ "#": dup.track(utils.text.random(9)), "@": msg["#"], put, err }))
        }

        if (ack) {
            respond(ack)
        } else {
            store.get(msg.get, (err, ack) => respond(ack, err || undefined), { secure: true })
        }
    }

    const handlePut = async (msg: { put: Graph; "#": string }, send: (msg: string) => void): Promise<void> => {
        const update = await Ham.mix(msg.put, graph, options.secure || false, listen)

        if (Object.keys(update.now).length === 0) {
            if (Object.keys(update.defer).length > 0) {
                setTimeout(() => handlePut({ put: update.defer, "#": msg["#"] }, send), update.wait)
            }
            return
        }

        if (!(await check(update.now, send as never))) return

        store.put(update.now, err => {
            send(JSON.stringify({ "#": dup.track(utils.text.random(9)), "@": msg["#"], err }))
            update.listeners.forEach(cb => cb())
        })

        if (Object.keys(update.defer).length > 0) {
            setTimeout(() => handlePut({ put: update.defer, "#": msg["#"] }, send), update.wait)
        }
    }

    const getWithCallback = (
        lex: Lex,
        cb: (msg: WireMessage) => void,
        send: (msg: string) => { err?: string } | void,
        _opt?: WireOptions
    ): void => {
        if (!cb) return

        const opts = _opt || {}
        const ack = Get(lex, graph, opts.fast)
        const dupTrack = dup.track(utils.text.random(9))
        const request = JSON.stringify({ "#": dupTrack, get: lex })

        const handleResponse = (put?: Graph, err?: string) => {
            const sendResult = send(request)
            if (sendResult?.err) {
                cb({ err: sendResult.err })
                delete queue[dupTrack]
                return
            }
            if (put || err) {
                cb({ put, err })
            }
        }

        if (ack) {
            handleResponse(ack)
            return
        }

        store.get(
            lex,
            (err, ack) => {
                if (ack) {
                    handleResponse(ack, err || undefined)
                } else {
                    if (err) console.log(err)
                    queue[dupTrack] = cb

                    const waitMs = opts.wait || 100
                    setTimeout(() => {
                        if (queue[dupTrack]) {
                            const id = lex["#"]
                            const ack: Graph = { [id]: null as never }
                            if (typeof lex["."] === "string") {
                                ack[id] = { [lex["."]]: null } as never
                            }
                            cb({ "#": dupTrack, put: ack })
                            delete queue[dupTrack]
                        }
                    }, waitMs)

                    handleResponse()
                }
            },
            opts
        )
    }

    // ============================================================================
    // Message Handler
    // ============================================================================

    const handleMessage = async (data: string, clientId = "default"): Promise<void> => {
        try {
            // Validate message
            const validation = validateMessage(data)
            if (!validation.valid) {
                console.error("Invalid message:", validation.error)
                return
            }

            // Rate limiting
            const delay = rateLimiter.getDelay(clientId)
            if (delay > 0) {
                if (rateLimiter.shouldDisconnect(clientId)) {
                    console.warn(`Client ${clientId} exceeded rate limit, disconnecting`)
                    return
                }
                await new Promise(resolve => setTimeout(resolve, delay))
            }

            const msg = JSON.parse(data) as WireMessage
            if (!msg["#"] || dup.check(msg["#"])) return

            dup.track(msg["#"]!)

            // Handle HELLO (Handshake)
            if (msg.hello) {
                const pubKey = msg.hello.pub
                const connId = clientId // The transport's ID for this connection

                // If we have a valid key, add to FingerTable
                if (pubKey && connId) {
                    // Decide how to send back to this specific connection
                    // If server mode, we use server.sendTo(connId, ...)
                    // If client mode, we usually have a single transport instance per connection (or handle it differently)
                    // For now assuming server mode or unified transport abstraction

                    const sender = (m: string) => {
                        if (options.transportServer) options.transportServer.sendTo(connId, m)
                        else if (options.transport) options.transport.send(m)
                    }

                    await fingerTable.addPeer({
                        id: pubKey,
                        send: sender
                    })
                    // Optional: Log/Debug
                    // console.log(`Handshake verified: ${pubKey} mapped to ${connId}`)
                }
            }

            // Handle GET
            if (msg.get) {
                handleGet(msg as never, sendFunction)
            }

            // Handle PUT with filtering
            if (msg.put) {
                // Extract references from relevant souls
                for (const [soul, node] of Object.entries(msg.put)) {
                    if (((await hasSoul(soul)) || pendingReferences.has(soul) || listen[soul]) && node && typeof node === "object") {
                        for (const value of Object.values(node)) {
                            const soulId = utils.rel.is(value as GraphValue)
                            if (soulId) pendingReferences.add(soulId)
                        }
                    }
                }

                // Filter souls
                const filteredPut: Graph = {}
                for (const [soul, node] of Object.entries(msg.put)) {
                    if ((await hasSoul(soul)) || pendingReferences.has(soul) || listen[soul]) {
                        filteredPut[soul] = node
                        pendingReferences.delete(soul)
                    }
                }

                if (Object.keys(filteredPut).length > 0) {
                    await handlePut({ put: filteredPut, "#": msg["#"]! }, sendFunction)
                }
            }

            // Handle ACK
            const cb = queue[msg["@"]!]
            if (cb) {
                delete (msg as { "#"?: string })["#"]
                delete (msg as { "@"?: string })["@"]
                cb(msg)
                delete queue[msg["@"]!]
            }
        } catch (error) {
            console.error("Error handling message:", error)
        }
    }

    // ============================================================================
    // Transport Integration
    // ============================================================================

    let sendFunction: (msg: string) => { err?: string } | void
    let messageQueue: ReturnType<typeof createMessageQueue>

    // Server mode
    if (options.transportServer) {
        const server = options.transportServer

        server.onMessage((data, clientId) => {
            // Pass to handleMessage. Handshake logic is inside there now.
            handleMessage(data, clientId)
        })
        server.onConnection(id => {
            console.log(`Client connected: ${id}`)
            // Send HELLO to initiate/complete handshake
            const helloMsg = JSON.stringify({ hello: { pub: selfId } })
            server.sendTo(id, helloMsg)
        })
        server.onDisconnection(id => {
            console.log(`Client disconnected: ${id}`)
            fingerTable.removePeer(id)
        })

        // Route via FingerTable instead of broadcast
        const routedSend = async (data: string) => {
            // Extract target from data if possible?
            // WireMessage is inside JSON.
            try {
                const msg = JSON.parse(data) as WireMessage
                // If it's a GET or PUT, we have a target SOUL.
                // We should find peers close to that SOUL.
                let targetId: string | undefined

                if (msg.get && msg.get["#"]) targetId = msg.get["#"]
                else if (msg.put) {
                    // PUT might have multiple souls. Pick first? XOR routing usually keys on the Hash(Soul).
                    // In Mesh, souls are keys. 
                    targetId = Object.keys(msg.put)[0]
                }

                if (targetId) {
                    const peers = await fingerTable.findClosestPeers(targetId)
                    if (peers.length > 0) {
                        peers.forEach(p => p.send(data))
                        return
                    }
                }
            } catch (e) { }

            // Fallback to broadcast if no target or no peers found
            server.broadcast(data)
        }

        messageQueue = createMessageQueue(routedSend, options.maxQueueLength || 1000)
        sendFunction = messageQueue.enqueue

        server.start().catch(error => console.error("Failed to start transport server:", error))
    }
    // Client mode
    else if (options.transport || (options.transports && options.transports.length > 0)) {
        // Merge single transport and array into one list
        const allTransports: Transport[] = [
            ...(options.transport ? [options.transport] : []),
            ...(options.transports || []),
        ]

        for (const transport of allTransports) {
            transport.onMessage((data) => handleMessage(data, "server"))
            transport.onError(error => console.error("Transport error:", error))
            transport.onClose(() => console.log("Transport connection closed"))

            const sendHello = () => {
                if (transport.isConnected()) {
                    transport.send(JSON.stringify({ hello: { pub: selfId } })).catch(error => console.error("Send HELLO error:", error))
                }
            }

            if (transport.isConnected()) {
                sendHello()
            }

            if (transport.onOpen) {
                transport.onOpen(() => {
                    sendHello()
                    // Flush message queue when a transport connects
                    if (messageQueue) {
                        const size = messageQueue.size()
                        if (size > 0) messageQueue.flush()
                    }
                })
            }
        }

        // Route via FingerTable, fallback to broadcast to all connected transports
        const routedSend = async (data: string) => {
            // Try FingerTable routing first
            try {
                const msg = JSON.parse(data) as WireMessage
                let targetId: string | undefined
                if (msg.get && msg.get["#"]) targetId = msg.get["#"]
                else if (msg.put) targetId = Object.keys(msg.put)[0]

                if (targetId) {
                    const peers = await fingerTable.findClosestPeers(targetId)
                    if (peers.length > 0) {
                        peers.forEach(p => p.send(data))
                        return
                    }
                }
            } catch (e) { }

            // Fallback: send to all connected transports
            let sentToAny = false
            for (const transport of allTransports) {
                if (transport.isConnected()) {
                    transport.send(data).catch(error => console.error("Send error:", error))
                    sentToAny = true
                }
            }

            if (!sentToAny) {
                return { err: "No transports connected" }
            }
        }

        messageQueue = createMessageQueue(routedSend, options.maxQueueLength || 1000)
        sendFunction = messageQueue.enqueue
    }
    // Fallback - no transport configured, local-only mode (noop send)
    else {
        sendFunction = () => {}
    }

    // ============================================================================
    // Public API
    // ============================================================================

    return {
        get: (lex, cb, _opt) => {
            if (lex && typeof lex["."] === "number") lex = { ...lex, ".": String(lex["."]) }
            if (lex?.["#"]) pendingReferences.add(lex["#"])
            getWithCallback(lex, cb, sendFunction, _opt)
        },

        put: async (data, cb) => {
            const update = await Ham.mix(data, graph, options.secure || false, listen)
            if (Object.keys(update.now).length === 0) {
                cb?.(null)
                return
            }

            if (!(await check(update.now, sendFunction as never, cb))) return

            // Extract references
            for (const node of Object.values(update.now)) {
                if (node && typeof node === "object") {
                    for (const value of Object.values(node)) {
                        const soulId = utils.rel.is(value as GraphValue)
                        if (soulId) pendingReferences.add(soulId)
                    }
                }
            }

            store.put(update.now, err => {
                cb?.(err)
                update.listeners.forEach(l => l())
            })

            const sendResult = sendFunction(JSON.stringify({ "#": dup.track(utils.text.random(9)), put: data }))
            if (sendResult?.err) cb?.(sendResult.err)
        },

        on: (lex, cb, _get, _opt) => {
            if (lex && typeof lex["."] === "number") lex = { ...lex, ".": String(lex["."]) }
            const soul = lex?.["#"]
            if (!soul || !cb) return

            listen[soul] = listen[soul] || []
            listen[soul]!.push({ ".": lex["."], cb: cb as never })
            if (_get) getWithCallback(lex, cb as never, sendFunction, _opt)
        },

        off: (lex, cb) => {
            const soul = lex?.["#"]
            if (!soul || !listen[soul]) return

            if (cb) {
                const idx = listen[soul]!.findIndex(l => l.cb === (cb as never))
                if (idx >= 0) listen[soul]!.splice(idx, 1)
            } else {
                delete listen[soul]
            }
        },
    }
}

export default WireTransport
