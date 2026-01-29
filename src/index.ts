/**
 * Mesh TypeScript Entry Point
 * 
 * This is the main entry point for the TypeScript version of Mesh.
 * It exports all the main modules and types.
 */

// Main API
export { default as Mesh, type MeshAPI } from "./mesh"

// Core modules
export { default as Wire, type WireAPI } from "./wire"
export { default as User, type UserInterface } from "./user"
export { default as SEA } from "./sea"
export { default as Store, type StoreInterface } from "./store"

// Data structure modules
export { default as Ham } from "./ham"
export { default as Get } from "./get"
export { default as Radisk } from "./radisk"
export { default as Radix } from "./radix"
export { default as Dup, type DupInterface } from "./dup"

// Utilities
export * as utils from "./utils"
export * as seaUtils from "./sea-utils"
export { default as SafeBuffer } from "./buffer"
export { default as SeaArray } from "./array"

// Types and Schemas
export * from "./schemas"

// Default export
export { default } from "./mesh"

