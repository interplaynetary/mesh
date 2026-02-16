/**
 * WebSocket Transport Adapter
 * Functional-style transport implementation for WebSocket connections
 */

import type { Transport, TransportServer } from "../transport.js"

const isNode = typeof document === "undefined"

// Dynamic import for Node.js ws module
const wsModule = isNode ? await import("ws") : undefined

if (typeof globalThis.WebSocket === "undefined" && wsModule) {
    globalThis.WebSocket = wsModule.WebSocket as unknown as typeof WebSocket
}

// ============================================================================
// WebSocket Client Transport
// ============================================================================

export const WebSocketTransport = (options: {
    maxReconnectAttempts?: number
    reconnectDelay?: number
} = {}): Transport => {
    let ws: WebSocket | null = null
    let messageCallback: ((data: string, peerId?: string) => void) | null = null
    let errorCallback: ((error: Error) => void) | null = null
    let closeCallback: (() => void) | null = null
    let openCallback: (() => void) | null = null
    let reconnectAttempts = 0
    let shouldReconnect = true
    let currentAddress = ""

    const maxReconnectAttempts = options.maxReconnectAttempts || 5
    const reconnectDelay = options.reconnectDelay || 1000

    const connect = async (address: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            currentAddress = address
            ws = new WebSocket(address)

            ws.onopen = () => {
                reconnectAttempts = 0
                openCallback?.()
                resolve()
            }

            ws.onerror = () => {
                const error = new Error(`WebSocket connection error: ${address}`)
                errorCallback?.(error)
                reject(error)
            }

            ws.onmessage = (event: MessageEvent) => {
                messageCallback?.(event.data as string)
            }

            ws.onclose = () => {
                closeCallback?.()

                // Attempt reconnection
                if (shouldReconnect && reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++
                    const delay = reconnectDelay * Math.pow(2, reconnectAttempts - 1)
                    setTimeout(() => {
                        if (shouldReconnect) {
                            connect(currentAddress).catch(() => {
                                // Reconnection failed, will retry on next close
                            })
                        }
                    }, Math.min(delay, 30000))
                }
            }
        })
    }

    const disconnect = async (): Promise<void> => {
        shouldReconnect = false
        if (ws) {
            ws.close()
            ws = null
        }
    }

    const isConnected = (): boolean => {
        return ws !== null && ws.readyState === WebSocket.OPEN
    }

    const send = async (data: string): Promise<void> => {
        if (!isConnected()) {
            throw new Error("WebSocket not connected")
        }
        ws!.send(data)
    }

    const onMessage = (callback: (data: string, peerId?: string) => void): void => {
        messageCallback = callback
    }

    const onError = (callback: (error: Error) => void): void => {
        errorCallback = callback
    }

    const onClose = (callback: () => void): void => {
        closeCallback = callback
    }

    const onOpen = (callback: () => void): void => {
        openCallback = callback
    }

    return {
        connect,
        disconnect,
        isConnected,
        send,
        onMessage,
        onError,
        onClose,
        onOpen,
    }
}

// ============================================================================
// WebSocket Server Transport
// ============================================================================

export const WebSocketTransportServer = (options: {
    port?: number
    server?: unknown
} = {}): TransportServer => {
    let wss: any = null
    const clients = new Map<string, WebSocket>()
    let connectionCallback: ((clientId: string) => void) | null = null
    let disconnectionCallback: ((clientId: string) => void) | null = null
    let messageCallback: ((data: string, clientId: string) => void) | null = null

    const port = options.port || 8765
    const server = options.server

    const generateClientId = (): string => {
        return `ws_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
    }

    const start = async (): Promise<void> => {
        if (!isNode || !wsModule) {
            throw new Error("WebSocketTransportServer only works in Node.js environment")
        }

        const config = server ? { server: server as never } : { port }
        wss = new wsModule.WebSocketServer(config)

        wss.on("connection", (ws: never) => {
            const clientId = generateClientId()
            clients.set(clientId, ws as WebSocket)

            connectionCallback?.(clientId)

            const wsNode = ws as never as { on: (event: string, cb: (...args: never[]) => void) => void }

            wsNode.on("message", (data: Buffer) => {
                messageCallback?.(data.toString(), clientId)
            })

            wsNode.on("close", () => {
                clients.delete(clientId)
                disconnectionCallback?.(clientId)
            })

            wsNode.on("error", (error: Error) => {
                console.error(`WebSocket client error (${clientId}):`, error)
            })
        })
    }

    const stop = async (): Promise<void> => {
        if (wss) {
            wss.close()
            wss = null
        }
        clients.clear()
    }

    const broadcast = (data: string, exclude: string[] = []): void => {
        const excludeSet = new Set(exclude)
        for (const [clientId, ws] of clients.entries()) {
            if (!excludeSet.has(clientId) && ws.readyState === WebSocket.OPEN) {
                ws.send(data)
            }
        }
    }

    const sendTo = (clientId: string, data: string): void => {
        const ws = clients.get(clientId)
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(data)
        }
    }

    const onConnection = (callback: (clientId: string) => void): void => {
        connectionCallback = callback
    }

    const onDisconnection = (callback: (clientId: string) => void): void => {
        disconnectionCallback = callback
    }

    const onMessage = (callback: (data: string, clientId: string) => void): void => {
        messageCallback = callback
    }

    const getConnectedClients = (): string[] => {
        return Array.from(clients.keys())
    }

    return {
        start,
        stop,
        broadcast,
        sendTo,
        onConnection,
        onDisconnection,
        onMessage,
        getConnectedClients,
    }
}
