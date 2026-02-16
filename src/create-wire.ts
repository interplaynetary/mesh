import WireTransport, { type WireAPI, type WireTransportOptions } from "./wire-transport"
import { WebSocketTransport, WebSocketTransportServer } from "./transports/websocket"
import type { Transport } from "./transport"
import type { MeshOptions } from "./schemas"

export const createWire = (options: MeshOptions): WireAPI => {
  const transports: Transport[] = []
  let transportServer

  // Create server transport if port or server specified
  if (options.port || options.server) {
    transportServer = WebSocketTransportServer({ port: options.port, server: options.server })
  }

  // Create client transports for each peer
  const peers = options.peers instanceof Array ? options.peers : (options.peers ? [options.peers] : [])
  for (const peer of peers) {
    const transport = WebSocketTransport()
    transport.connect(peer).catch(() => {})
    transports.push(transport)
  }

  const wireOpts: WireTransportOptions = {
    ...options,
    transports: transports.length > 0 ? transports : undefined,
    transportServer,
  }

  return WireTransport(wireOpts)
}
