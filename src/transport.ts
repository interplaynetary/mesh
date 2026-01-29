/**
 * Transport - Abstract interface for network communication
 * Enables wire protocol to work with WebSocket, WebRTC, or any other transport
 */

/**
 * Transport interface for client-side connections
 * Abstracts the underlying transport mechanism (WebSocket, WebRTC, etc.)
 */
export interface Transport {
    /**
     * Connect to a remote address
     * @param address - Connection address (e.g., "ws://localhost:8765" or peer ID)
     */
    connect(address: string): Promise<void>

    /**
     * Disconnect from the remote endpoint
     */
    disconnect(): Promise<void>

    /**
     * Check if currently connected
     */
    isConnected(): boolean

    /**
     * Register callback for connection open/ready
     * @param callback - Called when connection is ready
     */
    onOpen?(callback: () => void): void

    /**
     * Send data to the remote endpoint
     * @param data - String data to send (typically JSON)
     */
    send(data: string): Promise<void>

    /**
     * Register callback for incoming messages
     * @param callback - Called when message is received
     */
    onMessage(callback: (data: string, peerId?: string) => void): void

    /**
     * Register callback for errors
     * @param callback - Called when error occurs
     */
    onError(callback: (error: Error) => void): void

    /**
     * Register callback for connection close
     * @param callback - Called when connection closes
     */
    onClose(callback: () => void): void

    /**
     * Get list of connected peer IDs (for P2P transports like WebRTC)
     * Optional - only implemented by P2P transports
     */
    getPeerIds?(): string[]

    /**
     * Connect to a specific peer (for P2P transports like WebRTC)
     * Optional - only implemented by P2P transports
     * @param peerId - Peer ID to connect to
     */
    connectToPeer?(peerId: string): Promise<void>
}

/**
 * Transport server interface for server-side connections
 * Manages multiple client connections
 */
export interface TransportServer {
    /**
     * Start the transport server
     */
    start(): Promise<void>

    /**
     * Stop the transport server
     */
    stop(): Promise<void>

    /**
     * Broadcast data to all connected clients
     * @param data - String data to broadcast
     * @param exclude - Optional list of client IDs to exclude from broadcast
     */
    broadcast(data: string, exclude?: string[]): void

    /**
     * Send data to a specific client
     * @param clientId - Client identifier
     * @param data - String data to send
     */
    sendTo(clientId: string, data: string): void

    /**
     * Register callback for new client connections
     * @param callback - Called when client connects
     */
    onConnection(callback: (clientId: string) => void): void

    /**
     * Register callback for client disconnections
     * @param callback - Called when client disconnects
     */
    onDisconnection(callback: (clientId: string) => void): void

    /**
     * Register callback for incoming messages from clients
     * @param callback - Called when message is received
     */
    onMessage(callback: (data: string, clientId: string) => void): void

    /**
     * Get list of currently connected client IDs
     */
    getConnectedClients(): string[]
}

/**
 * Transport factory function type
 * Used to create transport instances with configuration
 */
export type TransportFactory = (config?: unknown) => Transport

/**
 * Transport server factory function type
 * Used to create transport server instances with configuration
 */
export type TransportServerFactory = (config?: unknown) => TransportServer
