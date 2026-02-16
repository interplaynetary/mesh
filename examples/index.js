// Switch src to build for the production version.
import Mesh from "../src/mesh.js"

// Set readFromDisk to true to force reading from disk.
// (Restart the server so that graph is not in memory.)
const readFromDisk = false

const mesh = Mesh({ indexedDB: !readFromDisk })
globalThis.mesh = mesh

if (readFromDisk) {
  // Wait for the websocket to connect.
  setTimeout(() => {
    mesh.get("mark").next("boss", { ".": "species" }, data => {
      console.log("read from disk:", data)
    })
  }, 1000)
} else {
  // Create two updates that could happen in either order.
  setTimeout(() => {
    const update1 = {
      name: "Mark Nadal",
      boss: {
        name: "Fluffy",
        species: "a kitty",
      },
    }
    mesh.get("mark").put(update1, err => console.log("update1:", err))
  }, 1000 * Math.random())

  setTimeout(() => {
    const update2 = {
      name: "Mark",
      boss: {
        species: "felis silvestris",
        color: "ginger",
      },
    }
    mesh.get("mark").put(update2, err => console.log("update2:", err))
  }, 1000 * Math.random())

  // The API sets the state on properties to the current time, so the result
  // here depends on which update was called first.
  setTimeout(() => {
    mesh.get("mark").next("boss", { ".": "species" }, data => {
      console.log("get:", data)
    })
  }, 2000)
}
