import { useEffect, useRef } from 'react'
import {
  onValue,
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

  useEffect(() => {
    if (!roomId || !localUid) return

    let unsubscribes: Array<() => void> = []
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
        })

        // Listen for other participants
        const participantsRef = child(roomRef(roomId), 'participants')
        const unsubParticipants = onValue(
          participantsRef,
          (snapshot) => {
            const participants = snapshot.val() || {}
            const currentUids = Object.keys(participants)

            // Detect new participants
            Object.entries(participants).forEach(([uid, data]: [string, any]) => {
              if (uid !== localUid && !processedPeers.has(uid)) {
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
            })

            // Detect departures
            for (const uid of processedPeers) {
              if (uid !== localUid && !currentUids.includes(uid)) {
                processedPeers.delete(uid)
                callbacksRef.current.onPeerLeft(uid)
              }
            }
          },
          { onlyOnce: false }
        )

        unsubscribes.push(unsubParticipants)
      } catch (error) {
        console.error('Failed to register presence:', error)
      }
    })()

    return () => {
      unsubscribes.forEach((unsub) => unsub())
      remove(presenceRef)
    }
  }, [roomId, localUid, localName])

  function setupOfferListener(
    roomId: string,
    localUid: string,
    remoteUid: string
  ): Array<() => void> {
    const unsubscribes: Array<() => void> = []

    const offerRefPath = offerRef(roomId, localUid, remoteUid)
    const unsubOffer = onValue(
      offerRefPath,
      (snapshot) => {
        const data = snapshot.val()
        if (data && data.sdp) {
          callbacksRef.current.onOffer(remoteUid, {
            type: 'offer',
            sdp: data.sdp,
          })
        }
      },
      { onlyOnce: true }
    )
    unsubscribes.push(unsubOffer)

    // Also listen for answer from remote
    const answerRefPath = answerRef(roomId, remoteUid, localUid)
    const unsubAnswer = onValue(
      answerRefPath,
      (snapshot) => {
        const data = snapshot.val()
        if (data && data.sdp) {
          callbacksRef.current.onAnswer(remoteUid, {
            type: 'answer',
            sdp: data.sdp,
          })
        }
      },
      { onlyOnce: true }
    )
    unsubscribes.push(unsubAnswer)

    // Listen for answer ICE candidates
    const answerCandidatesRefPath = answerCandidatesRef(
      roomId,
      remoteUid,
      localUid
    )
    const unsubCandidates = onValue(
      answerCandidatesRefPath,
      (snapshot) => {
        const candidates = snapshot.val() || {}
        Object.values(candidates).forEach((candidate: any) => {
          if (candidate && candidate.candidate) {
            callbacksRef.current.onIceCandidate(remoteUid, {
              candidate: candidate.candidate,
              sdpMid: candidate.sdpMid,
              sdpMLineIndex: candidate.sdpMLineIndex,
            })
          }
        })
      }
    )
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
        if (data && data.sdp) {
          callbacksRef.current.onOffer(remoteUid, {
            type: 'offer',
            sdp: data.sdp,
          })
        }
      },
      { onlyOnce: true }
    )
    unsubscribes.push(unsubOffer)

    // Listen for offer ICE candidates
    const offerCandidatesRefPath = offerCandidatesRef(
      roomId,
      remoteUid,
      localUid
    )
    const unsubCandidates = onValue(
      offerCandidatesRefPath,
      (snapshot) => {
        const candidates = snapshot.val() || {}
        Object.values(candidates).forEach((candidate: any) => {
          if (candidate && candidate.candidate) {
            callbacksRef.current.onIceCandidate(remoteUid, {
              candidate: candidate.candidate,
              sdpMid: candidate.sdpMid,
              sdpMLineIndex: candidate.sdpMLineIndex,
            })
          }
        })
      }
    )
    unsubscribes.push(unsubCandidates)

    return unsubscribes
  }

  return {
    sendOffer: async (
      remoteUid: string,
      sdp: string
    ): Promise<void> => {
      if (!roomId) return
      const minUid = localUid < remoteUid ? localUid : remoteUid
      const maxUid = localUid < remoteUid ? remoteUid : localUid
      await set(offerRef(roomId, minUid, maxUid), {
        sdp,
        type: 'offer',
      })
    },

    sendAnswer: async (
      remoteUid: string,
      sdp: string
    ): Promise<void> => {
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
