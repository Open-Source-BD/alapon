import { useEffect } from 'react'
import {
  onValue,
  set,
  push,
  onDisconnect,
  remove,
  DatabaseReference,
  serverTimestamp,
} from 'firebase/database'
import {
  roomRef,
  participantRef,
  signalingRef,
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
  const localUid = useMeetingStore((s) => s.localUid)
  const localName = useMeetingStore((s) => s.localName)

  useEffect(() => {
    if (!roomId || !localUid) return

    let unsubscribes: Array<() => void> = []

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
        const participantsRef = roomRef(roomId).child('participants')
        const unsubParticipants = onValue(
          participantsRef,
          (snapshot) => {
            const participants = snapshot.val() || {}

            // Find new participants
            Object.entries(participants).forEach(([uid, data]: [string, any]) => {
              if (uid !== localUid) {
                callbacks.onPeerJoined(uid, data.name)

                // If we have smaller UID, we're the offerer
                if (localUid < uid) {
                  setupOfferListener(roomId, localUid, uid)
                } else {
                  // Otherwise we're the answerer
                  setupAnswerListener(roomId, localUid, uid)
                }
              }
            })
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
  }, [roomId, localUid, localName, callbacks])

  function setupOfferListener(
    roomId: string,
    localUid: string,
    remoteUid: string
  ): void {
    const offerRefPath = offerRef(roomId, localUid, remoteUid)

    const unsubOffer = onValue(
      offerRefPath,
      (snapshot) => {
        const data = snapshot.val()
        if (data && data.sdp) {
          callbacks.onOffer(remoteUid, {
            type: 'offer',
            sdp: data.sdp,
          })
        }
      },
      { onlyOnce: true }
    )

    // Also listen for answer from remote
    const answerRefPath = answerRef(roomId, remoteUid, localUid)
    const unsubAnswer = onValue(
      answerRefPath,
      (snapshot) => {
        const data = snapshot.val()
        if (data && data.sdp) {
          callbacks.onAnswer(remoteUid, {
            type: 'answer',
            sdp: data.sdp,
          })
        }
      },
      { onlyOnce: true }
    )

    // Listen for answer ICE candidates
    const answerCandidatesRefPath = answerCandidatesRef(
      roomId,
      remoteUid,
      localUid
    )
    const unsubAnswerCandidates = onValue(
      answerCandidatesRefPath,
      (snapshot) => {
        const candidates = snapshot.val() || {}
        Object.values(candidates).forEach((candidate: any) => {
          if (candidate && candidate.candidate) {
            callbacks.onIceCandidate(remoteUid, {
              candidate: candidate.candidate,
              sdpMid: candidate.sdpMid,
              sdpMLineIndex: candidate.sdpMLineIndex,
            })
          }
        })
      }
    )
  }

  function setupAnswerListener(
    roomId: string,
    localUid: string,
    remoteUid: string
  ): void {
    const offerRefPath = offerRef(roomId, remoteUid, localUid)

    const unsubOffer = onValue(
      offerRefPath,
      (snapshot) => {
        const data = snapshot.val()
        if (data && data.sdp) {
          callbacks.onOffer(remoteUid, {
            type: 'offer',
            sdp: data.sdp,
          })
        }
      },
      { onlyOnce: true }
    )

    // Listen for offer ICE candidates
    const offerCandidatesRefPath = offerCandidatesRef(
      roomId,
      remoteUid,
      localUid
    )
    const unsubOfferCandidates = onValue(
      offerCandidatesRefPath,
      (snapshot) => {
        const candidates = snapshot.val() || {}
        Object.values(candidates).forEach((candidate: any) => {
          if (candidate && candidate.candidate) {
            callbacks.onIceCandidate(remoteUid, {
              candidate: candidate.candidate,
              sdpMid: candidate.sdpMid,
              sdpMLineIndex: candidate.sdpMLineIndex,
            })
          }
        })
      }
    )
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
