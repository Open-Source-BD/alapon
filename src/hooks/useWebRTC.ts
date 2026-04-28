import { useEffect, useRef, useCallback } from 'react'
import { nanoid } from 'nanoid'
import { getIceServers } from '@/lib/iceServers'
import { applyEncoderTransform, applyDecoderTransform } from '@/lib/crypto'
import { useMeetingStore } from '@/store/meetingStore'
import { useSignaling } from './useSignaling'
import type { SignalingCallbacks } from './useSignaling'

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

  const createPeerConnection = useCallback(
    (remoteUid: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection({
        iceServers: getIceServers(),
        encodedInsertableStreams: true,
      } as any)

      // Add local tracks
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          const sender = pc.addTrack(track, localStream)

          // Apply encoder transform if encryption is enabled
          if (encryptionKey) {
            applyEncoderTransform(sender, encryptionKey)
          }
        })
      }

      // Handle incoming tracks
      pc.ontrack = (event) => {
        const [stream] = event.streams

        // Apply decoder transform if encryption is enabled
        if (encryptionKey) {
          applyDecoderTransform(event.receiver, encryptionKey)
        }

        setPeerStream(remoteUid, stream)
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

  const setupDataChannel = useCallback(
    (remoteUid: string, channel: RTCDataChannel) => {
      channel.onopen = () => {
        console.log('Data channel opened:', remoteUid)
      }

      channel.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'chat') {
            addChatMessage({
              id: message.id,
              fromUid: remoteUid,
              fromName: message.fromName,
              text: message.text,
              timestamp: message.timestamp,
            })
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
    [createPeerConnection, setupDataChannel]
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
    [createPeerConnection]
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
    []
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
      removePeer(remoteUid)
    },
    [removePeer]
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

  signalingMethodsRef.current = useSignaling(
    roomId,
    {
      onPeerJoined: (uid: string, name: string) => {
        addPeer(uid, name)
        if (localUid < uid) {
          initiateCall(uid)
        }
      },
      onPeerLeft: (uid: string) => {
        hangupPeer(uid)
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
  }
}
