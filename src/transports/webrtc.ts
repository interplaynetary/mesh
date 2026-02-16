/**
 * WebRTC Transport Adapter
 * Functional-style transport implementation for WebRTC P2P connections
 */

import type { Transport } from "../transport.js"
import WebRTC, { type WebRTCAPI, type SignalingMessage } from "../webrtc.js"
import type { UserIdentity } from "../schemas.js"

// ============================================================================
// WebRTC P2P Transport
// ============================================================================

export interface WebRTCTransportAdapter extends Transport {
    handleSignal(signal: SignalingMessage): Promise<void>
    onSignal(callback: (signal: SignalingMessage) => void): void
}

export const WebRTCTransport = (
    user: UserIdentity,
    options: {
        onSignal?: (signal: SignalingMessage) => void
        iceServers?: RTCIceServer[]
    } = {}
): WebRTCTransportAdapter => {
    let messageCallback: ((data: string, peerId?: string) => void) | null = null
    let closeCallback: (() => void) | null = null
    let signalingCallback = options.onSignal || null

    // Initialize WebRTC with callbacks
    const webrtc: WebRTCAPI = WebRTC(user, {
        iceServers: options.iceServers,
        onMessage: (data: string, peerId: string) => {
            messageCallback?.(data, peerId)
        },
        onPeerConnected: (peerId: string) => {
            console.log(`WebRTC peer connected: ${peerId}`)
        },
        onPeerDisconnected: (peerId: string) => {
            console.log(`WebRTC peer disconnected: ${peerId}`)
            closeCallback?.()
        },
        onOffer: (signal: SignalingMessage) => {
            signalingCallback?.(signal)
        },
        onAnswer: (signal: SignalingMessage) => {
            signalingCallback?.(signal)
        },
        onIceCandidate: (signal: SignalingMessage) => {
            signalingCallback?.(signal)
        },
    })

    const connect = async (address: string): Promise<void> => {
        await webrtc.connect(address)
    }

    const disconnect = async (): Promise<void> => {
        const peerIds = webrtc.getConnectedPeerIds()
        for (const peerId of peerIds) {
            webrtc.disconnect(peerId)
        }
    }

    const isConnected = (): boolean => {
        return webrtc.getConnectedPeerIds().length > 0
    }

    const send = async (data: string): Promise<void> => {
        const sent = webrtc.send(data)
        if (!sent) {
            throw new Error("Failed to send message - no connected peers")
        }
    }

    const onMessage = (callback: (data: string, peerId?: string) => void): void => {
        messageCallback = callback
    }

    const onError = (_callback: (error: Error) => void): void => {
        // WebRTC errors are handled internally by the WebRTC module
        console.log("WebRTC error callback registered (handled internally)")
    }

    const onClose = (callback: () => void): void => {
        closeCallback = callback
    }

    const getPeerIds = (): string[] => {
        return webrtc.getConnectedPeerIds()
    }

    const connectToPeer = async (peerId: string): Promise<void> => {
        await connect(peerId)
    }

    /**
     * Handle incoming signaling message (offer, answer, ICE candidate)
     * This should be called when signaling messages are received via the relay
     */
    const handleSignal = async (signal: SignalingMessage): Promise<void> => {
        if (signal.type === "offer" || signal.type === "answer") {
            const description = signal.type === "offer" ? signal.offer : signal.answer
            if (description) {
                await webrtc.handleDescription(description, signal.from)
            }
        } else if (signal.type === "ice" && signal.candidate) {
            await webrtc.handleIceCandidate(signal.candidate, signal.from)
        }
    }

    /**
     * Set callback for outgoing signaling messages
     * These should be sent via the relay to the target peer
     */
    const onSignal = (callback: (signal: SignalingMessage) => void): void => {
        signalingCallback = callback
    }

    return {
        connect,
        disconnect,
        isConnected,
        send,
        onMessage,
        onError,
        onClose,
        getPeerIds,
        connectToPeer,
        // Additional WebRTC-specific methods
        handleSignal,
        onSignal,
    }
}
