import { describe, test, expect } from "bun:test"
import FingerTable from "../src/fingertable"
import XOR from "../src/xor"

describe("FingerTable", () => {
    const selfId = "0000" // Simple ID for testing
    const ft = FingerTable(selfId)

    // Mock peers
    const peer1 = { id: "1000", send: () => { } } // Distance: 1...
    const peer2 = { id: "0100", send: () => { } } // Distance: 01...
    const peer3 = { id: "0010", send: () => { } } // Distance: 001...
    const peer4 = { id: "0001", send: () => { } } // Distance: 0001... (Closest)

    test("addPeer adds peers correctly", async () => {
        await ft.addPeer(peer1)
        await ft.addPeer(peer2)

        expect(ft.count()).toBe(2)
        expect(ft.getPeer("1000")).toBe(peer1)
        expect(ft.getPeer("0100")).toBe(peer2)
    })

    test("getPeerIds returns all peer IDs", async () => {
        const ids = ft.getPeerIds()
        expect(ids).toContain("1000")
        expect(ids).toContain("0100")
        expect(ids.length).toBe(2)
    })

    test("findClosestPeers sorts by XOR distance", async () => {
        // Add more peers to have a mix
        await ft.addPeer(peer3)
        await ft.addPeer(peer4)

        // Target is selfId "0000"
        // Distances:
        // peer4 "0001": XOR 1
        // peer3 "0010": XOR 2
        // peer2 "0100": XOR 4
        // peer1 "1000": XOR 8

        // Note: The XOR implementation uses SHA256 hashing of IDs, so "0000" string isn't literal bits.
        // However, the test should verify that the result matches what XOR.findKClosest would return.

        const closest = await ft.findClosestPeers(selfId, 4)
        expect(closest.length).toBe(4)

        // Verify order by manually calculating distances using XOR util
        const p1Dist = await XOR.distance(selfId, peer1.id)
        const p2Dist = await XOR.distance(selfId, peer2.id)
        const p3Dist = await XOR.distance(selfId, peer3.id)
        const p4Dist = await XOR.distance(selfId, peer4.id)

        // Helper to check sort order
        const checkOrder = (a: Uint8Array, b: Uint8Array) => XOR.compareDistance(a, b) <= 0

        // The closest[0] should be closer than closest[1], etc.
        const d0 = await XOR.distance(selfId, closest[0].id)
        const d1 = await XOR.distance(selfId, closest[1].id)
        const d2 = await XOR.distance(selfId, closest[2].id)
        const d3 = await XOR.distance(selfId, closest[3].id)

        expect(checkOrder(d0, d1)).toBe(true)
        expect(checkOrder(d1, d2)).toBe(true)
        expect(checkOrder(d2, d3)).toBe(true)
    })

    test("removePeer removes peer", async () => {
        await ft.removePeer("1000")
        expect(ft.count()).toBe(3)
        expect(ft.getPeer("1000")).toBeUndefined()

        const ids = ft.getPeerIds()
        expect(ids).not.toContain("1000")
    })
})
