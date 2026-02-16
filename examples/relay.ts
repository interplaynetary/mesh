import Mesh from "../src/index"
import type { FileSystemInterface } from "../src/schemas"

// A relay that accepts data but stores nothing permanently (No-Op Store)
const NoOpStore: FileSystemInterface = {
    get: (file, cb) => {
        // Always return null/empty for reads, as we store nothing
        cb(null, undefined)
    },
    put: (file, data, cb) => {
        // Pretend to save successfully
        // This allows the relay to acknowledge the message and forward it to other peers
        cb(null)
    },
    list: (cb) => {
        // No files to list
        cb()
    }
}

// Start the Mesh Relay
const mesh = Mesh({
    port: 8765,           // Listen on port 8765
    store: NoOpStore,     // Use our custom no-op store (prevents disk writes)
    peers: []             // No upstream peers, this is a central relay
})

console.log("-----------------------------------------")
console.log("Mesh Relay running on ws://localhost:8765")
console.log("Mode: Stateless (No data persistence)")
console.log("-----------------------------------------")
