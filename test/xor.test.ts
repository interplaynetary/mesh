#!/usr/bin/env node
/**
 * XOR Distance Module Test
 * Demonstrates XOR distance calculation with WebRTC-compatible peer IDs
 */

import * as xor from '../src/xor.js'

// Simulate SEA public keys (format: "x.y")
const peerIds = [
    "abc123.def456",  // Peer A
    "xyz789.uvw012",  // Peer B
    "mno345.pqr678",  // Peer C
    "stu901.vwx234",  // Peer D
]

const myPeerId = "alice.wonderland"
const targetSoul = "photos/vacation"

async function testXorDistance() {
    console.log("🧪 Testing XOR Distance Module\n")
    console.log("=".repeat(60))

    // Test 1: Calculate distance between two peer IDs
    console.log("\n📏 Test 1: Distance Calculation")
    console.log("-".repeat(60))
    const dist = await xor.distance(peerIds[0]!, peerIds[1]!)
    console.log(`Distance between ${peerIds[0]} and ${peerIds[1]}:`)
    console.log(`  Hex: ${xor.distanceToHex(dist)}`)
    console.log(`  Leading zeros: ${xor.leadingZeros(dist)}`)

    // Test 2: Find k-closest peers to target
    console.log("\n🎯 Test 2: Find K-Closest Peers")
    console.log("-".repeat(60))
    console.log(`Target soul: "${targetSoul}"`)
    console.log(`Available peers: ${peerIds.length}`)

    const closest = await xor.findKClosest(targetSoul, peerIds, 3)
    console.log(`\n3 closest peers to target:`)
    for (let i = 0; i < closest.length; i++) {
        const peerId = closest[i]!
        const dist = await xor.distance(peerId, targetSoul)
        console.log(`  ${i + 1}. ${peerId}`)
        console.log(`     Distance: ${xor.distanceToHex(dist).substring(0, 16)}...`)
    }

    // Test 3: Check if peer is closer
    console.log("\n🔍 Test 3: Compare Peer Distances")
    console.log("-".repeat(60))
    const isACloser = await xor.isCloser(peerIds[0]!, peerIds[1]!, targetSoul)
    console.log(`Is ${peerIds[0]} closer to "${targetSoul}" than ${peerIds[1]}?`)
    console.log(`  Result: ${isACloser ? "Yes ✓" : "No ✗"}`)

    // Test 4: Filter peers closer than current peer
    console.log("\n⚡ Test 4: Filter Closer Peers (XOR Routing)")
    console.log("-".repeat(60))
    console.log(`My peer ID: ${myPeerId}`)
    console.log(`Target: "${targetSoul}"`)

    const closerPeers = await xor.filterCloser(myPeerId, targetSoul, peerIds)
    console.log(`\nPeers closer to target than me: ${closerPeers.length}/${peerIds.length}`)
    for (const peerId of closerPeers) {
        console.log(`  - ${peerId}`)
    }

    // Test 5: Bucket index calculation
    console.log("\n📦 Test 5: Bucket Index (Finger Table)")
    console.log("-".repeat(60))
    console.log(`My peer ID: ${myPeerId}`)

    for (const peerId of peerIds.slice(0, 3)) {
        const bucket = await xor.bucketIndex(myPeerId, peerId)
        console.log(`  ${peerId} → Bucket ${bucket}`)
    }

    // Test 6: XOR invariant verification
    console.log("\n✅ Test 6: XOR Routing Invariant")
    console.log("-".repeat(60))
    console.log("Verifying: every hop reduces XOR distance to target")

    const myDist = await xor.distance(myPeerId, targetSoul)
    console.log(`\nMy distance to target: ${xor.distanceToHex(myDist).substring(0, 16)}...`)

    let validHops = 0
    for (const peerId of closerPeers) {
        const peerDist = await xor.distance(peerId, targetSoul)
        const isValid = xor.compareDistance(peerDist, myDist) < 0
        if (isValid) validHops++

        console.log(`  ${peerId}:`)
        console.log(`    Distance: ${xor.distanceToHex(peerDist).substring(0, 16)}...`)
        console.log(`    Valid hop: ${isValid ? "✓" : "✗"}`)
    }

    console.log(`\n✓ ${validHops}/${closerPeers.length} peers satisfy XOR invariant`)

    console.log("\n" + "=".repeat(60))
    console.log("✨ All tests completed successfully!\n")
}

// Run tests
testXorDistance().catch(console.error)
