/**
 * XOR Distance Utilities
 * Implements XOR-based distance calculation for peer routing in the mesh network
 * 
 * Based on PROTOCOL.md specification:
 * - XOR creates a shared monotonic gradient for routing
 * - Every hop must reduce XOR distance to target
 * - Provides O(log N) routing without forced storage
 * - Compatible with WebRTC peer IDs (SEA public keys)
 */

import { sha256 } from "./sea-utils.js"

/**
 * Convert a string (peer ID or soul) to a hash buffer for XOR operations
 * Peer IDs are SEA public keys in format "x.y"
 * Souls are arbitrary strings like "photos/vacation" or "~pubkey"
 */
export const toHash = async (id: string): Promise<Uint8Array> => {
    const hash = await sha256(id)
    return new Uint8Array(hash)
}

/**
 * Calculate XOR distance between two hash buffers
 * Returns a new buffer containing the XOR result
 * Smaller distance = closer in XOR space
 */
export const xorBuffers = (a: Uint8Array, b: Uint8Array): Uint8Array => {
    const length = Math.min(a.length, b.length)
    const result = new Uint8Array(length)

    for (let i = 0; i < length; i++) {
        result[i] = a[i]! ^ b[i]!
    }

    return result
}

/**
 * Calculate XOR distance between two IDs (peer IDs or souls)
 * Returns the XOR distance as a Uint8Array
 * 
 * @param idA - First ID (peer ID or soul)
 * @param idB - Second ID (peer ID or soul)
 * @returns XOR distance as byte array
 */
export const distance = async (idA: string, idB: string): Promise<Uint8Array> => {
    const hashA = await toHash(idA)
    const hashB = await toHash(idB)
    return xorBuffers(hashA, hashB)
}

/**
 * Compare two XOR distances
 * Returns:
 *  -1 if distA < distB (distA is closer)
 *   0 if distA === distB (equal distance)
 *   1 if distA > distB (distB is closer)
 */
export const compareDistance = (distA: Uint8Array, distB: Uint8Array): number => {
    const length = Math.min(distA.length, distB.length)

    for (let i = 0; i < length; i++) {
        if (distA[i]! < distB[i]!) return -1
        if (distA[i]! > distB[i]!) return 1
    }

    // If all bytes are equal, compare lengths
    if (distA.length < distB.length) return -1
    if (distA.length > distB.length) return 1

    return 0
}

/**
 * Count leading zeros in a distance buffer
 * Used for determining which bucket a peer belongs to in the finger table
 * Higher leading zeros = closer in XOR space
 */
export const leadingZeros = (dist: Uint8Array): number => {
    let zeros = 0

    for (let i = 0; i < dist.length; i++) {
        const byte = dist[i]!

        if (byte === 0) {
            zeros += 8
        } else {
            // Count leading zeros in this byte
            let mask = 0x80
            for (let bit = 0; bit < 8; bit++) {
                if ((byte & mask) !== 0) break
                zeros++
                mask >>= 1
            }
            break
        }
    }

    return zeros
}

/**
 * Find the k closest peers to a target from a list of peer IDs
 * Used for XOR routing to select next hops
 * 
 * @param targetId - Target soul or peer ID
 * @param peerIds - List of available peer IDs
 * @param k - Number of closest peers to return
 * @returns Array of k closest peer IDs, sorted by distance (closest first)
 */
export const findKClosest = async (
    targetId: string,
    peerIds: string[],
    k: number = 6
): Promise<string[]> => {
    const targetHash = await toHash(targetId)

    // Calculate distances for all peers
    const peersWithDistance = await Promise.all(
        peerIds.map(async (peerId) => {
            const peerHash = await toHash(peerId)
            const dist = xorBuffers(peerHash, targetHash)
            return { peerId, distance: dist }
        })
    )

    // Sort by distance (ascending)
    peersWithDistance.sort((a, b) => compareDistance(a.distance, b.distance))

    // Return k closest peer IDs
    return peersWithDistance.slice(0, k).map(p => p.peerId)
}

/**
 * Check if peerA is closer to target than peerB
 * Used for XOR routing invariant: every hop must reduce distance
 * 
 * @param peerA - First peer ID
 * @param peerB - Second peer ID  
 * @param targetId - Target soul or peer ID
 * @returns true if peerA is closer to target than peerB
 */
export const isCloser = async (
    peerA: string,
    peerB: string,
    targetId: string
): Promise<boolean> => {
    const targetHash = await toHash(targetId)
    const hashA = await toHash(peerA)
    const hashB = await toHash(peerB)

    const distA = xorBuffers(hashA, targetHash)
    const distB = xorBuffers(hashB, targetHash)

    return compareDistance(distA, distB) < 0
}

/**
 * Filter peers that are closer to target than current peer
 * Used for XOR routing to ensure monotonic progress
 * 
 * @param myPeerId - Current peer's ID
 * @param targetId - Target soul or peer ID
 * @param peerIds - List of candidate peer IDs
 * @returns Array of peer IDs that are closer to target than myPeerId
 */
export const filterCloser = async (
    myPeerId: string,
    targetId: string,
    peerIds: string[]
): Promise<string[]> => {
    const targetHash = await toHash(targetId)
    const myHash = await toHash(myPeerId)
    const myDistance = xorBuffers(myHash, targetHash)

    const closerPeers: string[] = []

    for (const peerId of peerIds) {
        const peerHash = await toHash(peerId)
        const peerDistance = xorBuffers(peerHash, targetHash)

        if (compareDistance(peerDistance, myDistance) < 0) {
            closerPeers.push(peerId)
        }
    }

    return closerPeers
}

/**
 * Calculate the bucket index for a peer based on XOR distance
 * Used for organizing finger table by distance buckets
 * 
 * Bucket index = number of leading zeros in XOR distance
 * This creates a logarithmic distribution across XOR space
 * 
 * @param myPeerId - Current peer's ID
 * @param peerId - Peer ID to calculate bucket for
 * @returns Bucket index (0-255 for SHA-256)
 */
export const bucketIndex = async (
    myPeerId: string,
    peerId: string
): Promise<number> => {
    const dist = await distance(myPeerId, peerId)
    return leadingZeros(dist)
}

/**
 * Convert distance buffer to hex string for debugging
 */
export const distanceToHex = (dist: Uint8Array): string => {
    return Array.from(dist)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
}

/**
 * Convert distance buffer to binary string for debugging
 */
export const distanceToBinary = (dist: Uint8Array): string => {
    return Array.from(dist)
        .map(b => b.toString(2).padStart(8, '0'))
        .join(' ')
}

export default {
    toHash,
    xorBuffers,
    distance,
    compareDistance,
    leadingZeros,
    findKClosest,
    isCloser,
    filterCloser,
    bucketIndex,
    distanceToHex,
    distanceToBinary,
}
