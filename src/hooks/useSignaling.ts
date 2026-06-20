import { useEffect, useRef } from 'react'
import {
  onValue,
  onChildAdded,
  set,
  push,
  onDisconnect,
  remove,
  serverTimestamp,
  child,
} from 'firebase/database'
import {
  roomRef,
  participantRef,
  offerRef,
  answerRef,
  offerCandidatesRef,
  answerCandidatesRef,
} from '@/lib/firebase'
import { useMeetingStore } from '@/store/meetingStore'

export interface SignalingCallbacks {
  onPeerJoined: (uid: string, name: string) => void
  onPeerLeft: (uid: string) => void
  onOffer: (fromUid: string, sdp: RTCSessionDescriptionInit) => void
  onAnswer: (fromUid: string, sdp: RTCSessionDescriptionInit) => void
  onIceCandidate: (fromUid: string, candidate: RTCIceCandidateInit) => void
}

export function useSignaling(
  roomId: string | null,
  callbacks: SignalingCallbacks
) {
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  const localUid = useMeetingStore((s) => s.localUid)
  const localName = useMeetingStore((s) => s.localName)
  const isAudioMuted = useMeetingStore((s) => s.isAudioMuted)
  const isVideoOff = useMeetingStore((s) => s.isVideoOff)
  const isHandRaised = useMeetingStore((s) => s.isHandRaised)
  const updatePeer = useMeetingStore((s) => s.updatePeer)
  const setSignalingError = useMeetingStore((s) => s.setSignalingError)

  // De-dup SDP delivery so persistent (onlyOnce: false) offer/answer listeners
  // only fire the callback when the SDP actually changes. This is what lets a
  // *second* offer/answer (ICE restart / renegotiation) reach the peer; with
  // onlyOnce: true the listener unsubscribed after the first and silently
  // dropped reconnection offers. Refs so the maps survive re-renders.
  const lastOfferSdp = useRef(new Map<string, string>())
  const lastAnswerSdp = useRef(new Map<string, string>())

  // True once the initial presence object (with name/uid/joinedAt) has been
  // written. The mute/video sync effect below writes individual child keys,
  // which Firebase rejects (permission_denied) if the parent participant node
  // doesn't exist yet — so it must wait for this.
  const presenceReadyRef = useRef(false)

  useEffect(() => {
    if (!roomId || !localUid) return

    const unsubscribes: Array<() => void> = []
    const processedPeers = new Set<string>()

    // Register presence
    const presenceRef = participantRef(roomId, localUid)
    const disconnectRef = onDisconnect(presenceRef)

    ;(async () => {
      try {
        // Set onDisconnect BEFORE writing presence
        await disconnectRef.remove()

        // Now set presence
        await set(presenceRef, {
          uid: localUid,
          name: localName,
          joinedAt: serverTimestamp(),
          isAudioMuted,
          isVideoOff,
          isHandRaised,
        })

        // Presence object now exists, so child-key writes (mute/video sync)
        // will pass validation.
        presenceReadyRef.current = true

        // Clear any prior error once we've successfully registered.
        setSignalingError(null)

        // Listen for other participants
        const participantsRef = child(roomRef(roomId), 'participants')
        const unsubParticipants = onValue(
          participantsRef,
          (snapshot) => {
            const participants = snapshot.val() || {}
            const currentUids = Object.keys(participants)

            // Detect new participants and updates
            Object.entries(participants).forEach(
              ([uid, data]: [string, any]) => {
                if (uid === localUid) return

                if (!processedPeers.has(uid)) {
                  processedPeers.add(uid)
                  callbacksRef.current.onPeerJoined(uid, data.name)

                  // If we have smaller UID, we're the offerer
                  if (localUid < uid) {
                    const unsubs = setupOfferListener(roomId, localUid, uid)
                    unsubscribes.push(...unsubs)
                  } else {
                    // Otherwise we're the answerer
                    const unsubs = setupAnswerListener(roomId, localUid, uid)
                    unsubscribes.push(...unsubs)
                  }
                }

                // Sync mute/video/hand state
                updatePeer(uid, {
                  isAudioMuted: data.isAudioMuted ?? false,
                  isVideoOff: data.isVideoOff ?? false,
                  isHandRaised: data.isHandRaised ?? false,
                })
              }
            )

            // Detect departures
            for (const uid of processedPeers) {
              if (uid !== localUid && !currentUids.includes(uid)) {
                processedPeers.delete(uid)
                lastOfferSdp.current.delete(uid)
                lastAnswerSdp.current.delete(uid)
                callbacksRef.current.onPeerLeft(uid)
              }
            }
          },
          { onlyOnce: false }
        )

        unsubscribes.push(unsubParticipants)
      } catch (error) {
        console.error('Failed to register presence:', error)
        setSignalingError(
          "Couldn't connect to the room. Check your connection and try again."
        )
      }
    })()

    return () => {
      unsubscribes.forEach((unsub) => unsub())
      remove(presenceRef)
    }
  }, [roomId, localUid])

  // Sync local state changes to Firebase. Skipped until the presence object
  // exists — the initial presence write already includes the current mute/video
  // state, so the only thing this effect needs to handle is later *changes*, and
  // writing child keys before the parent node exists fails rule validation.
  useEffect(() => {
    if (!roomId || !localUid || !presenceReadyRef.current) return

    const presenceRef = participantRef(roomId, localUid)
    set(child(presenceRef, 'isAudioMuted'), isAudioMuted)
    set(child(presenceRef, 'isVideoOff'), isVideoOff)
    set(child(presenceRef, 'isHandRaised'), isHandRaised)
  }, [roomId, localUid, isAudioMuted, isVideoOff, isHandRaised])

  function setupOfferListener(
    roomId: string,
    localUid: string,
    remoteUid: string
  ): Array<() => void> {
    const unsubscribes: Array<() => void> = []

    // Listen for answer from remote (persistent + de-duped so a renegotiated
    // answer after an ICE restart is still delivered).
    const answerRefPath = answerRef(roomId, remoteUid, localUid)
    const unsubAnswer = onValue(
      answerRefPath,
      (snapshot) => {
        const data = snapshot.val()
        if (data && data.sdp && lastAnswerSdp.current.get(remoteUid) !== data.sdp) {
          lastAnswerSdp.current.set(remoteUid, data.sdp)
          callbacksRef.current.onAnswer(remoteUid, {
            type: 'answer',
            sdp: data.sdp,
          })
        }
      },
      { onlyOnce: false }
    )
    unsubscribes.push(unsubAnswer)

    // Listen for answer ICE candidates. onChildAdded delivers each candidate
    // exactly once as it arrives, instead of onValue replaying the whole node
    // on every change.
    const answerCandidatesRefPath = answerCandidatesRef(
      roomId,
      remoteUid,
      localUid
    )
    const unsubCandidates = onChildAdded(answerCandidatesRefPath, (snapshot) => {
      const candidate = snapshot.val()
      if (candidate && candidate.candidate) {
        callbacksRef.current.onIceCandidate(remoteUid, {
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        })
      }
    })
    unsubscribes.push(unsubCandidates)

    return unsubscribes
  }

  function setupAnswerListener(
    roomId: string,
    localUid: string,
    remoteUid: string
  ): Array<() => void> {
    const unsubscribes: Array<() => void> = []

    const offerRefPath = offerRef(roomId, remoteUid, localUid)
    const unsubOffer = onValue(
      offerRefPath,
      (snapshot) => {
        const data = snapshot.val()
        if (data && data.sdp && lastOfferSdp.current.get(remoteUid) !== data.sdp) {
          lastOfferSdp.current.set(remoteUid, data.sdp)
          callbacksRef.current.onOffer(remoteUid, {
            type: 'offer',
            sdp: data.sdp,
          })
        }
      },
      { onlyOnce: false }
    )
    unsubscribes.push(unsubOffer)

    // Listen for offer ICE candidates (each delivered once via onChildAdded).
    const offerCandidatesRefPath = offerCandidatesRef(
      roomId,
      remoteUid,
      localUid
    )
    const unsubCandidates = onChildAdded(offerCandidatesRefPath, (snapshot) => {
      const candidate = snapshot.val()
      if (candidate && candidate.candidate) {
        callbacksRef.current.onIceCandidate(remoteUid, {
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        })
      }
    })
    unsubscribes.push(unsubCandidates)

    return unsubscribes
  }

  return {
    sendOffer: async (remoteUid: string, sdp: string): Promise<void> => {
      if (!roomId) return
      const minUid = localUid < remoteUid ? localUid : remoteUid
      const maxUid = localUid < remoteUid ? remoteUid : localUid
      await set(offerRef(roomId, minUid, maxUid), {
        sdp,
        type: 'offer',
      })
    },

    sendAnswer: async (remoteUid: string, sdp: string): Promise<void> => {
      if (!roomId) return
      const minUid = localUid < remoteUid ? localUid : remoteUid
      const maxUid = localUid < remoteUid ? remoteUid : localUid
      await set(answerRef(roomId, maxUid, minUid), {
        sdp,
        type: 'answer',
      })
    },

    sendCandidate: async (
      remoteUid: string,
      candidate: RTCIceCandidate,
      isAnswer: boolean
    ): Promise<void> => {
      if (!roomId) return
      const minUid = localUid < remoteUid ? localUid : remoteUid
      const maxUid = localUid < remoteUid ? remoteUid : localUid

      const candidatesPath = isAnswer
        ? answerCandidatesRef(roomId, maxUid, minUid)
        : offerCandidatesRef(roomId, minUid, maxUid)

      await push(candidatesPath, {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
      })
    },

    deleteRoom: async (): Promise<void> => {
      if (!roomId) return
      await remove(roomRef(roomId))
    },
  }
}
