/**
 * Mesh TypeScript Entry Point
 * 
 * This is the main entry point for the TypeScript version of Mesh.
 * It exports all the main modules and types.
 */

// Main API
export { default as Mesh, type MeshAPI } from "./mesh"

// Core modules
export { default as WireTransport, type WireAPI } from "./wire-transport"
export { default as User, type UserInterface } from "./user"
export { default as SEA } from "./sea"
export { default as Store, type StoreInterface } from "./store"
export { default as WebRTC, type WebRTCAPI, type WebRTCOptions, type WebRTCPeerConnection, type SignalingMessage } from "./webrtc"

// Data structure modules
export { default as Ham } from "./ham"
export { default as Get } from "./get"
export { default as Radisk } from "./radisk"
export { default as Radix } from "./radix"
export { default as Dup, type DupInterface } from "./dup"

// Utilities
export * as utils from "./utils"
export * as seaUtils from "./sea-utils"
export * as xor from "./xor"
export { default as SafeBuffer } from "./buffer"
export { default as SeaArray } from "./array"

// Transport abstraction
export * from "./transport"
export { WebSocketTransport, WebSocketTransportServer } from "./transports/websocket"
export { WebRTCTransport } from "./transports/webrtc"
export { type WireTransportOptions } from "./wire-transport"
export { createWire } from "./create-wire"

// Types and Schemas
export * from "./schemas"

// Default export
export { default } from "./mesh"

