/**
 * Finger Table - XOR-based peer routing table
 * Manages peer connections in buckets based on XOR distance
 */

import XOR from "./xor"

export interface Peer {
    id: string
    send: (msg: string) => void
    [key: string]: any
}

export interface FingerTableAPI {
    addPeer: (peer: Peer) => Promise<boolean>
    removePeer: (peerId: string) => Promise<void>
    findClosestPeers: (targetId: string, k?: number) => Promise<Peer[]>
    getPeer: (peerId: string) => Peer | undefined
    getPeerIds: () => string[]
    count: () => number
}

const K_BUCKET_SIZE = 20

const FingerTable = (selfId: string): FingerTableAPI => {
    // Buckets map: bucket index (leading zeros) -> Array of Peers
    const buckets = new Map<number, Peer[]>()
    const peerMap = new Map<string, Peer>()

    const addPeer = async (peer: Peer): Promise<boolean> => {
        if (peer.id === selfId) return false
        if (peerMap.has(peer.id)) {
            // Update existing peer instance
            await removePeer(peer.id)
        }

        const bucketIdx = await XOR.bucketIndex(selfId, peer.id)

        if (!buckets.has(bucketIdx)) {
            buckets.set(bucketIdx, [])
        }

        const bucket = buckets.get(bucketIdx)!
        if (bucket.length >= K_BUCKET_SIZE) {
            // Bucket full. In full Kademlia, we'd ping the oldest.
            // For now, we drop the new one unless we implement replacement cache.
            // Or we can just drop the oldest (LRU-ish) which is simpler for now.
            // Let's drop the oldest (first in array) to allow new blood,
            // though Kademlia prefers old stable nodes.
            // Let's strictly follow Kademlia preference for stability:
            // If full, ignore new peer (unless we verify old is dead, which we can't do here yet).
            return false
        }

        bucket.push(peer)
        peerMap.set(peer.id, peer)
        return true
    }

    const removePeer = async (peerId: string): Promise<void> => {
        if (!peerMap.has(peerId)) return

        const bucketIdx = await XOR.bucketIndex(selfId, peerId)
        const bucket = buckets.get(bucketIdx)

        if (bucket) {
            const idx = bucket.findIndex(p => p.id === peerId)
            if (idx !== -1) {
                bucket.splice(idx, 1)
            }
            if (bucket.length === 0) {
                buckets.delete(bucketIdx)
            }
        }

        peerMap.delete(peerId)
    }

    const getPeer = (peerId: string): Peer | undefined => {
        return peerMap.get(peerId)
    }

    const findClosestPeers = async (targetId: string, k: number = 6): Promise<Peer[]> => {
        // Collect all peers
        const allPeers = Array.from(peerMap.values())
        const allPeerIds = allPeers.map(p => p.id)

        // Use XOR utility to find closest IDs
        const closestIds = await XOR.findKClosest(targetId, allPeerIds, k)

        // Map back to Peer objects
        return closestIds
            .map(id => peerMap.get(id))
            .filter((p): p is Peer => p !== undefined)
    }

    const getPeerIds = (): string[] => {
        return Array.from(peerMap.keys())
    }

    const count = (): number => {
        return peerMap.size
    }

    return {
        addPeer,
        removePeer,
        findClosestPeers,
        getPeer,
        getPeerIds,
        count
    }
}

export default FingerTable
