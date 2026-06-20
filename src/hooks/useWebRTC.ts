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
import { useConnectionQuality } from './useConnectionQuality'
import { BlurProcessor } from '@/lib/blurProcessor'

interface PeerConnection {
  pc: RTCPeerConnection
  dataChannel: RTCDataChannel | null
}

// ── File transfer over the data channel ─────────────────────────────────────
// Files are chunked and sent as base64-in-JSON (reuses the string router; ~33%
// overhead, simplest correct path). Ordered data channel guarantees meta →
// chunks → complete arrive in order.
const FILE_CHUNK_SIZE = 16 * 1024 // 16 KB per chunk
const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB cap
const DRAIN_THRESHOLD = 1 * 1024 * 1024 // pause sending when a channel buffers > 1MB

interface IncomingFile {
  name: string
  type: string
  size: number
  total: number
  chunks: string[]
  received: number
}

function abToBase64(buf: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

export function useWebRTC(roomId: string | null) {
  const peerConnectionsRef = useRef<Map<string, PeerConnection>>(new Map())
  const candidateQueuesRef = useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map()
  )
  const incomingFilesRef = useRef<Map<string, IncomingFile>>(new Map())
  const screenStreamRef = useRef<MediaStream | null>(null)
  const cameraVideoTrackRef = useRef<MediaStreamTrack | null>(null)
  const blurProcRef = useRef<BlurProcessor | null>(null)
  const blurCameraRef = useRef<MediaStreamTrack | null>(null)
  const videoEffect = useMeetingStore((s) => s.videoEffect)
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
  const {
    registerPeerConnection: registerQualityPc,
    unregisterPeerConnection: unregisterQualityPc,
  } = useConnectionQuality()

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

  // Background blur: when toggled on, run the camera through the on-device blur
  // processor and swap the processed track onto every sender + the self-view (same
  // replaceTrack pattern as screen share). Off → restore the raw camera. Any failure
  // reverts to raw camera so video is never black.
  useEffect(() => {
    let cancelled = false
    const swapOnSenders = (track: MediaStreamTrack) => {
      peerConnectionsRef.current.forEach(({ pc }) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
        if (sender) sender.replaceTrack(track).catch(() => {})
      })
    }

    const apply = async () => {
      const stream = useMeetingStore.getState().localStream
      if (!stream) return
      // Screen share owns the video track while active; blur applies to camera only.
      if (useMeetingStore.getState().isScreenSharing) return

      if (videoEffect === 'blur' && !blurProcRef.current) {
        const cam = stream.getVideoTracks()[0]
        if (!cam) return
        try {
          const proc = new BlurProcessor()
          const out = await proc.start(cam)
          if (cancelled) {
            proc.stop()
            return
          }
          blurProcRef.current = proc
          blurCameraRef.current = cam
          swapOnSenders(out)
          stream.removeTrack(cam) // keep cam LIVE (the processor reads it); just drop from self-view
          stream.addTrack(out)
        } catch {
          useMeetingStore.getState().setVideoEffect('none')
          useMeetingStore.getState().addToast('Background blur could not start', 'error')
        }
      } else if (videoEffect === 'none' && blurProcRef.current) {
        const cam = blurCameraRef.current
        if (cam) {
          swapOnSenders(cam)
          const processed = stream.getVideoTracks()[0]
          if (processed && processed !== cam) {
            stream.removeTrack(processed)
            processed.stop()
          }
          if (!stream.getVideoTracks().includes(cam)) stream.addTrack(cam)
        }
        blurProcRef.current.stop()
        blurProcRef.current = null
        blurCameraRef.current = null
      }
    }
    apply()
    return () => {
      cancelled = true
    }
  }, [videoEffect])

  const setupDataChannel = useCallback(
    (remoteUid: string, channel: RTCDataChannel) => {
      channel.onopen = () => {
        console.log('Data channel opened:', remoteUid)
        // Tell a late joiner we're already presenting so they spotlight us.
        if (useMeetingStore.getState().isScreenSharing) {
          try {
            channel.send(JSON.stringify({ type: 'presenting', on: true }))
          } catch {
            // best-effort
          }
        }
      }

      channel.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          const store = useMeetingStore.getState()
          switch (message.type) {
            case 'chat': {
              addChatMessage({
                id: message.id,
                fromUid: remoteUid,
                fromName: message.fromName,
                text: message.text,
                timestamp: message.timestamp,
                replyTo: message.replyTo,
              })
              store.setPeerTyping(remoteUid, false)
              // Receipt straight back to the sender on this channel. 'seen' if the
              // chat panel is open right now, otherwise just 'delivered'.
              try {
                channel.send(
                  JSON.stringify({
                    type: 'receipt',
                    msgId: message.id,
                    state: store.isChatOpen ? 'seen' : 'delivered',
                  })
                )
              } catch {
                // channel may be closing — receipt is best-effort.
              }
              break
            }
            case 'receipt':
              if (message.msgId && (message.state === 'delivered' || message.state === 'seen')) {
                store.markReceipt(message.msgId, remoteUid, message.state)
              }
              break
            case 'file-meta':
              incomingFilesRef.current.set(message.id, {
                name: message.name,
                type: message.fileType || 'application/octet-stream',
                size: message.size || 0,
                total: message.total || 0,
                chunks: new Array(message.total || 0),
                received: 0,
              })
              break
            case 'file-chunk': {
              const f = incomingFilesRef.current.get(message.id)
              if (f && typeof message.seq === 'number') {
                f.chunks[message.seq] = message.data
                f.received += 1
              }
              break
            }
            case 'file-complete': {
              const f = incomingFilesRef.current.get(message.id)
              incomingFilesRef.current.delete(message.id)
              if (f && f.received >= f.total) {
                const bytes = f.chunks.map(base64ToBytes)
                const blob = new Blob(bytes as BlobPart[], { type: f.type })
                const url = URL.createObjectURL(blob)
                addChatMessage({
                  id: message.id,
                  fromUid: remoteUid,
                  fromName: message.fromName || '',
                  text: '',
                  timestamp: Date.now(),
                  file: { name: f.name, type: f.type, size: f.size, url },
                })
                try {
                  channel.send(JSON.stringify({ type: 'receipt', msgId: message.id, state: store.isChatOpen ? 'seen' : 'delivered' }))
                } catch {
                  // best-effort
                }
              }
              break
            }
            case 'reaction':
              if (typeof message.emoji === 'string') {
                store.addReaction(remoteUid, message.emoji, message.id)
              }
              break
            case 'typing':
              store.setPeerTyping(remoteUid, !!message.typing)
              break
            case 'presenting': {
              const cur = store.presentingUid
              if (message.on) store.setPresenting(remoteUid)
              else if (cur === remoteUid) store.setPresenting(null)
              break
            }
            case 'msg-reaction':
              if (typeof message.emoji === 'string' && message.msgId) {
                store.toggleMessageReaction(message.msgId, message.emoji, remoteUid)
              }
              break
            case 'msg-delete': {
              // Delete-for-everyone: only honor it for the sender's own message.
              const target = store.chatMessages.find((m) => m.id === message.msgId)
              if (target && target.fromUid === remoteUid) {
                store.setMessageDeleted(message.msgId)
              }
              break
            }
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
        registerQualityPc(remoteUid, pc)

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
    [createPeerConnection, setupDataChannel, registerPeerConnection, registerQualityPc]
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
          registerQualityPc(fromUid, pc)
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
    [createPeerConnection, registerPeerConnection, registerQualityPc]
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
      unregisterQualityPc(remoteUid)
      removePeer(remoteUid)
    },
    [removePeer, unregisterPeerConnection, unregisterQualityPc]
  )

  const sendChatMessage = useCallback(
    (text: string, replyTo?: { id: string; fromName: string; text: string }) => {
      const message = {
        type: 'chat',
        id: nanoid(),
        fromName: localName,
        text,
        timestamp: Date.now(),
        replyTo,
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

  const sendMessageReaction = useCallback(
    (msgId: string, emoji: string) => {
      broadcast({ type: 'msg-reaction', msgId, emoji })
      useMeetingStore.getState().toggleMessageReaction(msgId, emoji, localUid)
    },
    [broadcast, localUid]
  )

  const sendMessageDelete = useCallback(
    (msgId: string) => {
      broadcast({ type: 'msg-delete', msgId })
      useMeetingStore.getState().setMessageDeleted(msgId)
    },
    [broadcast]
  )

  // Used by ChatPanel to send 'seen' for backlog messages when the panel opens.
  const sendReceipt = useCallback(
    (msgId: string, state: 'delivered' | 'seen') => {
      broadcast({ type: 'receipt', msgId, state })
    },
    [broadcast]
  )

  const sendFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        useMeetingStore.getState().addToast('File too large (max 25MB)', 'error')
        return
      }
      const id = nanoid()
      const buf = await file.arrayBuffer()
      const total = Math.max(1, Math.ceil(buf.byteLength / FILE_CHUNK_SIZE))

      // Show it in our own chat immediately (local object URL).
      addChatMessage({
        id,
        fromUid: localUid,
        fromName: localName,
        text: '',
        timestamp: Date.now(),
        file: { name: file.name, type: file.type, size: file.size, url: URL.createObjectURL(file) },
      })

      broadcast({
        type: 'file-meta',
        id,
        name: file.name,
        fileType: file.type,
        size: file.size,
        total,
        fromName: localName,
      })

      for (let seq = 0; seq < total; seq++) {
        const slice = buf.slice(seq * FILE_CHUNK_SIZE, (seq + 1) * FILE_CHUNK_SIZE)
        broadcast({ type: 'file-chunk', id, seq, total, data: abToBase64(slice) })
        // Backpressure: pause while any channel's send buffer is backed up, so a
        // big file doesn't blow the buffer or stall the media.
        let guard = 0
        while (guard++ < 2000) {
          let maxBuf = 0
          peerConnectionsRef.current.forEach((c) => {
            if (c.dataChannel) maxBuf = Math.max(maxBuf, c.dataChannel.bufferedAmount)
          })
          if (maxBuf < DRAIN_THRESHOLD) break
          await new Promise((r) => setTimeout(r, 50))
        }
      }

      broadcast({ type: 'file-complete', id, fromName: localName })
    },
    [broadcast, localUid, localName, addChatMessage]
  )

  // ── Screen share ──────────────────────────────────────────────────────────
  // Owned here because it needs the peer senders AND the data channel. We swap
  // the outgoing video track on every sender (replaceTrack = no renegotiation),
  // mirror the swap into our own self-view, and broadcast a 'presenting' signal
  // so every peer spotlights the presenter.
  const stopScreenShare = useCallback(async () => {
    const screenStream = screenStreamRef.current
    const camera = cameraVideoTrackRef.current
    const stream = useMeetingStore.getState().localStream

    peerConnectionsRef.current.forEach(({ pc }) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
      if (sender && camera) sender.replaceTrack(camera).catch(() => {})
    })

    // Self-view: swap the screen track back out for the camera.
    if (stream && screenStream) {
      screenStream.getVideoTracks().forEach((t) => {
        if (stream.getTracks().includes(t)) stream.removeTrack(t)
      })
      if (camera) stream.addTrack(camera)
    }
    screenStream?.getTracks().forEach((t) => t.stop())
    screenStreamRef.current = null
    cameraVideoTrackRef.current = null

    const store = useMeetingStore.getState()
    store.setScreenSharing(false)
    if (store.presentingUid === localUid) store.setPresenting(null)
    broadcast({ type: 'presenting', on: false })
  }, [broadcast, localUid])

  const startScreenShare = useCallback(async () => {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    })
    const screenTrack = screenStream.getVideoTracks()[0]
    if (!screenTrack) {
      screenStream.getTracks().forEach((t) => t.stop())
      throw new Error('No screen track')
    }
    screenStreamRef.current = screenStream

    const stream = useMeetingStore.getState().localStream
    cameraVideoTrackRef.current = stream?.getVideoTracks()[0] ?? null

    peerConnectionsRef.current.forEach(({ pc }) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
      if (sender) sender.replaceTrack(screenTrack).catch(() => {})
      else if (stream) pc.addTrack(screenTrack, stream) // audio-only joiner → renegotiate
    })

    // Self-view: show the screen in our own tile.
    if (stream && cameraVideoTrackRef.current) {
      stream.removeTrack(cameraVideoTrackRef.current)
      stream.addTrack(screenTrack)
    }

    const store = useMeetingStore.getState()
    store.setScreenSharing(true)
    store.setPresenting(localUid)
    broadcast({ type: 'presenting', on: true })

    // User clicks the browser's own "Stop sharing" bar.
    screenTrack.onended = () => {
      stopScreenShare()
    }
  }, [broadcast, localUid, stopScreenShare])

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
    sendMessageReaction,
    sendMessageDelete,
    sendReceipt,
    sendFile,
    startScreenShare,
    stopScreenShare,
  }
}
