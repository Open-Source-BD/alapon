import { useEffect, useRef, useCallback } from 'react'
import { useMeetingStore, type ConnectionQuality } from '@/store/meetingStore'

// Polls getStats() on each peer connection to surface connection quality, so the
// call never degrades silently. Mirrors useActiveSpeaker's register + poll pattern.
//   - Per remote peer: derive good/fair/poor from inbound video packet-loss + RTT,
//     written onto PeerState.quality (signal bars render from it).
//   - Local: if our OUTBOUND video is bandwidth/cpu limited, warn the user (the
//     honest "here's why it's bad" nudge), throttled so it can't spam.
const POLL_MS = 2000
const LOCAL_WARN_THROTTLE_MS = 30000

interface PrevStat {
  lost: number
  recv: number
}

export function useConnectionQuality() {
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const prevRef = useRef<Map<string, PrevStat>>(new Map())
  const lastLocalWarnRef = useRef(0)

  const updatePeer = useMeetingStore((s) => s.updatePeer)
  const addToast = useMeetingStore((s) => s.addToast)

  const registerPeerConnection = useCallback((uid: string, pc: RTCPeerConnection) => {
    pcsRef.current.set(uid, pc)
  }, [])

  const unregisterPeerConnection = useCallback((uid: string) => {
    pcsRef.current.delete(uid)
    prevRef.current.delete(uid)
  }, [])

  useEffect(() => {
    const poll = async () => {
      let localLimited = false

      for (const [uid, pc] of pcsRef.current) {
        try {
          const stats = await pc.getStats()
          let lost = 0
          let recv = 0
          let rtt = 0

          stats.forEach((report: any) => {
            if (report.type === 'inbound-rtp' && report.kind === 'video') {
              lost = report.packetsLost ?? 0
              recv = report.packetsReceived ?? 0
            }
            if (
              report.type === 'candidate-pair' &&
              report.state === 'succeeded' &&
              typeof report.currentRoundTripTime === 'number'
            ) {
              rtt = report.currentRoundTripTime
            }
            if (
              report.type === 'outbound-rtp' &&
              report.kind === 'video' &&
              report.qualityLimitationReason &&
              report.qualityLimitationReason !== 'none'
            ) {
              localLimited = true
            }
          })

          // Packet loss over the last interval, not cumulative.
          const prev = prevRef.current.get(uid)
          const lostDelta = prev ? lost - prev.lost : 0
          const recvDelta = prev ? recv - prev.recv : 0
          prevRef.current.set(uid, { lost, recv })
          const total = lostDelta + recvDelta
          const lossRatio = total > 0 ? lostDelta / total : 0

          let quality: ConnectionQuality = 'good'
          if (lossRatio > 0.1 || rtt > 0.5) quality = 'poor'
          else if (lossRatio > 0.03 || rtt > 0.25) quality = 'fair'

          updatePeer(uid, { quality })
        } catch {
          // getStats can fail on a closing connection — skip this tick.
        }
      }

      if (localLimited) {
        const now = Date.now()
        if (now - lastLocalWarnRef.current > LOCAL_WARN_THROTTLE_MS) {
          lastLocalWarnRef.current = now
          addToast(
            'Your connection is struggling — fewer participants improves quality',
            'error'
          )
        }
      }
    }

    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [updatePeer, addToast])

  return { registerPeerConnection, unregisterPeerConnection }
}
