// Switch src to build for the production version.
import Mesh from "../src/mesh.js"

const mesh = Mesh({ indexedDB: true })
globalThis.mesh = mesh

const user = mesh.user()

let alice, bob
// Wait for the websocket to connect.
setTimeout(() => {
  user.create("alice", "password", err => {
    if (err && err !== "Username already exists") {
      console.log(err)
      return
    }

    user.auth("alice", "password", err => {
      if (err) {
        console.log(err)
        return
      }

      // Store Alice's encryption key so Bob can use it to create shared data.
      alice = { epub: user.is.epub }
      console.log("Alice logged in.", user.is)

      const data = "Success! Only Alice can put data on their account"
      user.get("protected").put(data, err => {
        if (err) {
          console.log(err)
          return
        }

        user.get("protected", console.log)
      })
    })
  })
}, 1000)

setTimeout(() => {
  user.create("bob", "stronger password", err => {
    if (err && err !== "Username already exists") {
      console.log(err)
      return
    }

    user.auth("bob", "stronger password", async err => {
      if (err) {
        console.log(err)
        return
      }

      // Store Bob's public keys so Alice can use them to read shared data.
      bob = { pub: user.is.pub, epub: user.is.epub }
      console.log("Bob logged in.", user.is)

      // For this test let's create shared private data for Alice.
      const secret = await mesh.SEA.secret(alice, user.is)
      const shared = await mesh.SEA.encrypt("Hello Alice!", secret)
      user.get("shared").put(shared, err => {
        if (err) {
          console.log(err)
          return
        }

        console.log("Success! Bob wrote secret data to his account.")
      })
    })
  })
}, 2000)

setTimeout(() => {
  if (!bob) {
    console.log("Something went wrong, bob didn't log in.")
    return
  }

  // Use Bob's public key to fetch shared data under his account.
  user.get([bob.pub, "shared"], enc => {
    user.auth("alice", "password", async err => {
      if (err) {
        console.log(err)
        return
      }

      console.log("Alice logged in again.", user.is)
      const secret = await mesh.SEA.secret(bob, user.is)
      const shared = await mesh.SEA.decrypt(enc, secret)
      console.log("Alice's shared data from Bob:", shared)
    })
  })
}, 3000)
