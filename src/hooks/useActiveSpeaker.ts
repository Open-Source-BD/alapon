import { useEffect, useRef } from 'react'
import { useMeetingStore } from '@/store/meetingStore'

const AUDIO_LEVEL_THRESHOLD = 0.01
const SPEAKER_CHANGE_DEBOUNCE = 3 // Require 3 consecutive polls above threshold

export function useActiveSpeaker() {
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const speakerChangeCounterRef = useRef<Map<string, number>>(new Map())

  const setActiveSpeaker = useMeetingStore((s) => s.setActiveSpeaker)

  // Register peer connections (to be called from useWebRTC)
  const registerPeerConnection = (uid: string, pc: RTCPeerConnection) => {
    peerConnectionsRef.current.set(uid, pc)
  }

  const unregisterPeerConnection = (uid: string) => {
    peerConnectionsRef.current.delete(uid)
    speakerChangeCounterRef.current.delete(uid)
  }

  useEffect(() => {
    const pollAudioLevels = async () => {
      let maxLevel = 0
      let maxUid = ''
      let maxCount = 0

      for (const [uid, pc] of peerConnectionsRef.current) {
        try {
          const stats = await pc.getStats()
          let audioLevel = 0

          stats.forEach((report) => {
            if (
              report.type === 'inbound-rtp' &&
              report.kind === 'audio' &&
              typeof (report as any).audioLevel === 'number'
            ) {
              audioLevel = Math.max(audioLevel, (report as any).audioLevel)
            }
          })

          if (audioLevel > AUDIO_LEVEL_THRESHOLD) {
            const count =
              (speakerChangeCounterRef.current.get(uid) || 0) + 1
            speakerChangeCounterRef.current.set(uid, count)

            if (count >= SPEAKER_CHANGE_DEBOUNCE && audioLevel > maxLevel) {
              maxLevel = audioLevel
              maxUid = uid
              maxCount = count
            }
          } else {
            speakerChangeCounterRef.current.set(uid, 0)
          }
        } catch (error) {
          // Stats retrieval can fail, just continue
        }
      }

      if (maxUid) {
        setActiveSpeaker(maxUid)
      } else if (maxCount < SPEAKER_CHANGE_DEBOUNCE) {
        // No one speaking
        setActiveSpeaker(null)
      }
    }

    // Start polling every 200ms
    pollingIntervalRef.current = setInterval(pollAudioLevels, 200)

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [setActiveSpeaker])

  return {
    registerPeerConnection,
    unregisterPeerConnection,
  }
}
