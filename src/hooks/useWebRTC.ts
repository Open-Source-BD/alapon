import { useEffect, useRef, useCallback } from 'react'
import { nanoid } from 'nanoid'
import { getIceServers } from '@/lib/iceServers'
// NOTE: Frame-level AES-GCM E2E encryption lives in @/lib/crypto
// (applyEncoderTransform / applyDecoderTransform) but is not wired up yet — it
// previously broke video. See README "Known limitations". Re-enable here.
import { useMeetingStore } from '@/store/meetingStore'
import { useSignaling } from './useSignaling'
import type { SignalingCallbacks } from './useSignaling'
import { useActiveSpeaker } from './useActiveSpeaker'

interface PeerConnection {
  pc: RTCPeerConnection
  dataChannel: RTCDataChannel | null
}

export function useWebRTC(roomId: string | null) {
  const peerConnectionsRef = useRef<Map<string, PeerConnection>>(new Map())
  const candidateQueuesRef = useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map()
  )
  const remoteOfferStateRef = useRef<Map<string, boolean>>(new Map())
  const signalingMethodsRef = useRef<ReturnType<typeof useSignaling> | null>(null)

  const localUid = useMeetingStore((s) => s.localUid)
  const localName = useMeetingStore((s) => s.localName)
  const localStream = useMeetingStore((s) => s.localStream)
  const encryptionKey = useMeetingStore((s) => s.encryptionKey)

  const addPeer = useMeetingStore((s) => s.addPeer)
  const removePeer = useMeetingStore((s) => s.removePeer)
  const updatePeer = useMeetingStore((s) => s.updatePeer)
  const setPeerStream = useMeetingStore((s) => s.setPeerStream)
  const addChatMessage = useMeetingStore((s) => s.addChatMessage)

  // Active-speaker detection polls getStats() on the peer connections it knows
  // about. useWebRTC is the only place PCs are created, so it must register them
  // here; otherwise the detector's map stays empty and the feature is dead.
  const { registerPeerConnection, unregisterPeerConnection } = useActiveSpeaker()

  const createPeerConnection = useCallback(
    (remoteUid: string): RTCPeerConnection => {
      console.log('Creating PeerConnection for:', remoteUid)
      const pc = new RTCPeerConnection({
        iceServers: getIceServers(),
        // Temporarily disable to fix "Waiting for video" issue
        // encodedInsertableStreams: !!encryptionKey && supportsInsertableStreams,
      } as any)

      // Add local tracks
      if (localStream) {
        console.log('Adding local tracks to PC for:', remoteUid)
        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream)
        })
      }

      // Handle incoming tracks
      pc.ontrack = (event) => {
        console.log('Received remote track from:', remoteUid, event.track.kind)
        
        // Merge tracks into a single stream for this peer
        const existingPeer = useMeetingStore.getState().peers[remoteUid]
        let stream = existingPeer?.stream || new MediaStream()
        
        if (!stream.getTracks().find(t => t.id === event.track.id)) {
          stream.addTrack(event.track)
        }
        
        setPeerStream(remoteUid, stream)
      }

      pc.onnegotiationneeded = async () => {
        try {
          // Skip the *initial* negotiation: initiateCall() already sends the
          // first offer. Acting here too would create a second, competing offer
          // (glare) now that the signaling slot is overwritable. Only react to
          // genuine renegotiation (tracks changed after connect), and only the
          // offerer (lower UID) drives it.
          const isOfferer = localUid < remoteUid
          if (!isOfferer || !pc.remoteDescription) return
          if (pc.signalingState !== 'stable') return

          console.log('Renegotiation needed for:', remoteUid)
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          if (signalingMethodsRef.current && offer.sdp) {
            await signalingMethodsRef.current.sendOffer(remoteUid, offer.sdp)
          }
        } catch (error) {
          console.error('Negotiation failed:', error)
        }
      }

      // ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const isAnswer = remoteOfferStateRef.current.get(remoteUid)
          signalingMethodsRef.current?.sendCandidate(
            remoteUid,
            event.candidate,
            isAnswer ?? false
          )
        }
      }

      // Connection state changes
      pc.onconnectionstatechange = () => {
        console.log(`Connection State (${remoteUid}):`, pc.connectionState)
        console.log(`ICE Connection State (${remoteUid}):`, pc.iceConnectionState)
        
        updatePeer(remoteUid, {
          connectionState: pc.connectionState,
        })

        if (pc.connectionState === 'failed') {
          attemptIceRestart(remoteUid)
        }
      }

      // Data channel (offerer creates)
      pc.ondatachannel = (event) => {
        setupDataChannel(remoteUid, event.channel)
      }

      return pc
    },
    [localStream, encryptionKey, setPeerStream, updatePeer]
  )

  // Update existing connections when local stream changes
  useEffect(() => {
    if (!localStream) return
    
    peerConnectionsRef.current.forEach(({ pc }) => {
      const senders = pc.getSenders()
      localStream.getTracks().forEach((track) => {
        const sender = senders.find((s) => s.track?.kind === track.kind)
        if (sender) {
          if (sender.track !== track) {
            sender.replaceTrack(track)
          }
        } else {
          pc.addTrack(track, localStream)
        }
      })
    })
  }, [localStream])

  const setupDataChannel = useCallback(
    (remoteUid: string, channel: RTCDataChannel) => {
      channel.onopen = () => {
        console.log('Data channel opened:', remoteUid)
      }

      channel.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          const store = useMeetingStore.getState()
          switch (message.type) {
            case 'chat':
              addChatMessage({
                id: message.id,
                fromUid: remoteUid,
                fromName: message.fromName,
                text: message.text,
                timestamp: message.timestamp,
              })
              store.setPeerTyping(remoteUid, false)
              break
            case 'reaction':
              if (typeof message.emoji === 'string') {
                store.addReaction(remoteUid, message.emoji, message.id)
              }
              break
            case 'typing':
              store.setPeerTyping(remoteUid, !!message.typing)
              break
            default:
              // Unknown message type from a newer/older peer — ignore.
              break
          }
        } catch (error) {
          console.error('Failed to parse data channel message:', error)
        }
      }

      channel.onerror = (error) => {
        console.error('Data channel error:', error)
      }

      const connections = peerConnectionsRef.current.get(remoteUid)
      if (connections) {
        connections.dataChannel = channel
      }
    },
    [addChatMessage]
  )

  const initiateCall = useCallback(
    async (remoteUid: string) => {
      try {
        const pc = createPeerConnection(remoteUid)
        peerConnectionsRef.current.set(remoteUid, {
          pc,
          dataChannel: null,
        })
        registerPeerConnection(remoteUid, pc)

        remoteOfferStateRef.current.set(remoteUid, false)

        // Create data channel (offerer creates)
        const dataChannel = pc.createDataChannel('chat', { ordered: true })
        setupDataChannel(remoteUid, dataChannel)

        // Create and send offer
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        if (signalingMethodsRef.current && offer.sdp) {
          await signalingMethodsRef.current.sendOffer(remoteUid, offer.sdp)
        }
      } catch (error) {
        console.error('Failed to initiate call:', error)
      }
    },
    [createPeerConnection, setupDataChannel, registerPeerConnection]
  )

  const handleOffer = useCallback(
    async (fromUid: string, sdp: RTCSessionDescriptionInit) => {
      try {
        const connections = peerConnectionsRef.current.get(fromUid)
        const pc = connections?.pc ?? createPeerConnection(fromUid)

        if (!connections) {
          peerConnectionsRef.current.set(fromUid, {
            pc,
            dataChannel: null,
          })
          registerPeerConnection(fromUid, pc)
        }

        remoteOfferStateRef.current.set(fromUid, true)

        await pc.setRemoteDescription(new RTCSessionDescription(sdp))

        // Flush queued candidates
        const queue = candidateQueuesRef.current.get(fromUid) || []
        for (const candidate of queue) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate))
          } catch (error) {
            console.error('Failed to add queued candidate:', error)
          }
        }
        candidateQueuesRef.current.delete(fromUid)

        // Create and send answer
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        if (signalingMethodsRef.current && answer.sdp) {
          await signalingMethodsRef.current.sendAnswer(fromUid, answer.sdp)
        }
      } catch (error) {
        console.error('Failed to handle offer:', error)
      }
    },
    [createPeerConnection, registerPeerConnection]
  )

  const handleAnswer = useCallback(
    async (fromUid: string, sdp: RTCSessionDescriptionInit) => {
      try {
        const connections = peerConnectionsRef.current.get(fromUid)
        if (!connections) {
          console.error('No peer connection for answer:', fromUid)
          return
        }

        const { pc } = connections
        await pc.setRemoteDescription(new RTCSessionDescription(sdp))

        // Flush queued candidates
        const queue = candidateQueuesRef.current.get(fromUid) || []
        for (const candidate of queue) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate))
          } catch (error) {
            console.error('Failed to add queued candidate:', error)
          }
        }
        candidateQueuesRef.current.delete(fromUid)
      } catch (error) {
        console.error('Failed to handle answer:', error)
      }
    },
    []
  )

  const handleIceCandidate = useCallback(
    async (fromUid: string, candidate: RTCIceCandidateInit) => {
      try {
        const connections = peerConnectionsRef.current.get(fromUid)
        if (!connections) {
          // Queue for later
          const queue = candidateQueuesRef.current.get(fromUid) || []
          queue.push(candidate)
          candidateQueuesRef.current.set(fromUid, queue)
          return
        }

        const { pc } = connections
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        } else {
          // Queue for later
          const queue = candidateQueuesRef.current.get(fromUid) || []
          queue.push(candidate)
          candidateQueuesRef.current.set(fromUid, queue)
        }
      } catch (error) {
        console.error('Failed to handle ICE candidate:', error)
      }
    },
    []
  )

  const attemptIceRestart = useCallback(
    async (remoteUid: string) => {
      try {
        // Only the offerer (lower UID) drives ICE restart. If both peers wrote
        // restart offers to the same signaling slot they'd clobber each other.
        if (localUid >= remoteUid) return

        const connections = peerConnectionsRef.current.get(remoteUid)
        if (!connections || connections.pc.connectionState === 'closed') return

        const { pc } = connections
        const offer = await pc.createOffer({ iceRestart: true })
        await pc.setLocalDescription(offer)

        if (signalingMethodsRef.current && offer.sdp) {
          await signalingMethodsRef.current.sendOffer(remoteUid, offer.sdp)
        }
      } catch (error) {
        console.error('Failed ICE restart:', error)
      }
    },
    [localUid]
  )

  const hangupPeer = useCallback(
    (remoteUid: string) => {
      const connections = peerConnectionsRef.current.get(remoteUid)
      if (connections) {
        connections.pc.close()
        connections.dataChannel?.close()
      }

      peerConnectionsRef.current.delete(remoteUid)
      candidateQueuesRef.current.delete(remoteUid)
      remoteOfferStateRef.current.delete(remoteUid)
      unregisterPeerConnection(remoteUid)
      removePeer(remoteUid)
    },
    [removePeer, unregisterPeerConnection]
  )

  const sendChatMessage = useCallback(
    (text: string) => {
      const message = {
        type: 'chat',
        id: nanoid(),
        fromName: localName,
        text,
        timestamp: Date.now(),
      }

      peerConnectionsRef.current.forEach((connection) => {
        if (connection.dataChannel?.readyState === 'open') {
          try {
            connection.dataChannel.send(JSON.stringify(message))
          } catch (error) {
            console.error('Failed to send chat message:', error)
          }
        }
      })

      // Add to local chat
      addChatMessage({
        ...message,
        fromUid: localUid,
      })
    },
    [localName, localUid, addChatMessage]
  )

  // Broadcast a JSON payload to every open data channel (no local side effect).
  const broadcast = useCallback((payload: Record<string, unknown>) => {
    const data = JSON.stringify(payload)
    peerConnectionsRef.current.forEach((connection) => {
      if (connection.dataChannel?.readyState === 'open') {
        try {
          connection.dataChannel.send(data)
        } catch (error) {
          console.error('Failed to broadcast data channel message:', error)
        }
      }
    })
  }, [])

  const sendReaction = useCallback(
    (emoji: string) => {
      const id = nanoid()
      broadcast({ type: 'reaction', emoji, id })
      // Show our own reaction locally too.
      useMeetingStore.getState().addReaction(localUid, emoji, id)
    },
    [broadcast, localUid]
  )

  const sendTyping = useCallback(
    (typing: boolean) => {
      broadcast({ type: 'typing', typing })
    },
    [broadcast]
  )

  signalingMethodsRef.current = useSignaling(
    roomId,
    {
      onPeerJoined: (uid: string, name: string) => {
        addPeer(uid, name)
        useMeetingStore.getState().addToast(`${name || 'Someone'} joined`, 'info')
        if (localUid < uid) {
          initiateCall(uid)
        }
      },
      onPeerLeft: (uid: string) => {
        const name = useMeetingStore.getState().peers[uid]?.name
        hangupPeer(uid)
        useMeetingStore.getState().addToast(`${name || 'Someone'} left`, 'info')
      },
      onOffer: (fromUid: string, sdp: RTCSessionDescriptionInit) => {
        handleOffer(fromUid, sdp)
      },
      onAnswer: (fromUid: string, sdp: RTCSessionDescriptionInit) => {
        handleAnswer(fromUid, sdp)
      },
      onIceCandidate: (fromUid: string, candidate: RTCIceCandidateInit) => {
        handleIceCandidate(fromUid, candidate)
      },
    } as SignalingCallbacks
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      peerConnectionsRef.current.forEach((connection) => {
        connection.pc.close()
        connection.dataChannel?.close()
      })
      peerConnectionsRef.current.clear()
    }
  }, [])

  return {
    initiateCall,
    hangupPeer,
    sendChatMessage,
    sendReaction,
    sendTyping,
  }
}
