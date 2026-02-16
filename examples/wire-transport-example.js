/**
 * Example: Using WireTransport with WebSocket
 * Demonstrates how to use the transport abstraction layer with WebSocket
 */

import { WireTransport, WebSocketTransport, WebSocketTransportServer } from "../src/index.js"

// ============================================================================
// Server Example
// ============================================================================

async function startServer() {
    console.log("Starting WebSocket server on port 8765...")

    const transportServer = new WebSocketTransportServer({ port: 8765 })

    const wire = WireTransport({
        transportServer,
        file: "wire-transport-server",
    })

    // Set up some test data
    wire.put({
        "test-soul": {
            _: { "#": "test-soul", ">": { message: Date.now() } },
            message: "Hello from transport server!",
        },
    })

    console.log("Server ready! Listening for connections...")
}

// ============================================================================
// Client Example
// ============================================================================

async function startClient() {
    console.log("Starting WebSocket client...")

    const transport = new WebSocketTransport()
    await transport.connect("ws://localhost:8765")

    const wire = WireTransport({
        transport,
        file: "wire-transport-client",
    })

    // Subscribe to updates
    wire.on({ "#": "test-soul" }, () => {
        console.log("Received update!")
    }, true)

    // Get data
    wire.get({ "#": "test-soul" }, (msg) => {
        console.log("Received data:", msg)
    })

    // Put data
    setTimeout(() => {
        wire.put({
            "client-soul": {
                _: { "#": "client-soul", ">": { message: Date.now() } },
                message: "Hello from transport client!",
            },
        })
    }, 1000)
}

// ============================================================================
// Run Example
// ============================================================================

const mode = process.argv[2]

if (mode === "server") {
    startServer().catch(console.error)
} else if (mode === "client") {
    startClient().catch(console.error)
} else {
    console.log("Usage: node wire-transport-example.js [server|client]")
    console.log("")
    console.log("Run server in one terminal:")
    console.log("  node wire-transport-example.js server")
    console.log("")
    console.log("Run client in another terminal:")
    console.log("  node wire-transport-example.js client")
}
