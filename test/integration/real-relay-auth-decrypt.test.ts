/**
 * Integration test - Decrypt auth data from real relay
 * Attempts to authenticate with a test account
 *
 * Requires .env with TEST_RELAY_URL, TEST_USERNAME, TEST_PASSWORD
 */

import { describe, test, expect } from "bun:test"
import Mesh from "../../src/mesh"
import SEA from "../../src/sea"

const RELAY_URL = process.env.TEST_RELAY_URL || "wss://holster.haza.website"
const USERNAME = process.env.TEST_USERNAME || ""
const TEST_PASSWORD = process.env.TEST_PASSWORD || ""
const PUBKEY = process.env.TEST_RUZGAR_PUBKEY || ""

describe("Integration - Real relay decryption test", () => {
  test("attempts to authenticate and decrypt", async () => {
    const mesh = Mesh({
      peers: [RELAY_URL],
      file: "test/integration/real-relay-decrypt",
      port: 9950, // Use different port to avoid conflicts
    })

    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 2000))

    console.log("[TEST] Attempting to authenticate...")
    console.log(`[TEST] Username: ${USERNAME}`)
    console.log(`[TEST] Password: ${TEST_PASSWORD ? "SET" : "NOT SET - configure .env"}`)

    if (!USERNAME || !TEST_PASSWORD) {
      console.warn("[TEST] ⚠️  Set TEST_USERNAME and TEST_PASSWORD in .env to test authentication")
      return
    }

    const result = await new Promise<{ success: boolean; error?: string; user?: any }>((resolve) => {
      mesh.user().auth(USERNAME, TEST_PASSWORD, (err) => {
        if (err) {
          console.error(`[TEST] ✗ Authentication failed: ${err}`)
          resolve({ success: false, error: err })
        } else {
          console.log("[TEST] ✓ Authentication succeeded!")
          const user = mesh.user().is
          console.log("[TEST] User data:", {
            username: user?.username,
            pub: user?.pub,
            hasPriv: !!user?.priv,
            hasEpriv: !!user?.epriv,
          })
          resolve({ success: true, user })
        }
      })
    })

    if (result.success) {
      expect(result.user).toBeDefined()
      expect(result.user?.username).toBe(USERNAME)
    } else {
      console.log("[TEST] Authentication failed with error:", result.error)
      console.log("[TEST]")
      console.log("[TEST] Possible reasons:")
      console.log("[TEST] 1. Wrong password")
      console.log("[TEST] 2. Decryption failing (SEA.decrypt returns null)")
      console.log("[TEST] 3. Signature verification failing")
      console.log("[TEST] 4. Timing issue (data not received yet)")
    }
  }, 15000)

  test("manual decryption test with retrieved auth data", async () => {
    const mesh = Mesh({
      peers: [RELAY_URL],
      file: "test/integration/real-relay-manual-decrypt",
      port: 9951,
    })

    await new Promise(resolve => setTimeout(resolve, 2000))

    if (!PUBKEY) {
      console.warn("[TEST] Set TEST_RUZGAR_PUBKEY in .env to test manual decryption")
      return
    }

    console.log("[TEST] Retrieving auth data...")

    const authDataRaw = await new Promise((resolve) => {
      mesh.wire.get({ "#": PUBKEY, ".": "auth" }, (msg) => {
        resolve(msg)
      }, { wait: 1000 })
    })

    if (!authDataRaw || typeof authDataRaw !== 'object' || !('put' in authDataRaw)) {
      console.error("[TEST] Failed to retrieve auth data")
      return
    }

    const put = (authDataRaw as any).put
    const node = put[PUBKEY]

    if (!node || !node.auth) {
      console.error("[TEST] No auth field in response")
      return
    }

    console.log("[TEST] Auth data retrieved")

    const auth = JSON.parse(node.auth)
    console.log("[TEST] Auth structure:", {
      hasEnc: !!auth.enc,
      hasSalt: !!auth.salt,
      saltLength: auth.salt?.length,
      encHasCt: !!auth.enc?.ct,
      encHasIv: !!auth.enc?.iv,
      encHasS: !!auth.enc?.s,
    })

    console.log("[TEST]")
    console.log("[TEST] To manually test decryption:")
    console.log("[TEST] 1. const work = await SEA.work(password, auth.salt)")
    console.log("[TEST] 2. const dec = await SEA.decrypt(auth.enc, work)")
    console.log("[TEST] 3. Check if dec is null (wrong password) or has priv/epriv")
    console.log("[TEST]")
    console.log("[TEST] Auth salt:", auth.salt)
    console.log("[TEST] Auth enc:", JSON.stringify(auth.enc))

    if (TEST_PASSWORD) {
      console.log("[TEST]")
      console.log("[TEST] Testing decryption with provided password...")

      try {
        const work = await SEA.work(TEST_PASSWORD, auth.salt)
        console.log("[TEST] ✓ SEA.work completed, derived key length:", work?.length)

        const dec = await SEA.decrypt(auth.enc, work)

        if (dec) {
          console.log("[TEST] ✓ Decryption succeeded!")
          console.log("[TEST] Decrypted data has:", {
            hasPriv: !!dec.priv,
            hasEpriv: !!dec.epriv,
          })
          expect(dec).toHaveProperty('priv')
          expect(dec).toHaveProperty('epriv')
        } else {
          console.log("[TEST] ✗ Decryption failed - SEA.decrypt returned null")
          console.log("[TEST] This means the password is incorrect")
        }
      } catch (error) {
        console.error("[TEST] ✗ Decryption threw error:", error)
      }
    }
  }, 15000)
})
