import { useEffect, useRef } from 'react'
import { useMeetingStore } from '@/store/meetingStore'

// Warns "you're muted" when the user talks while muted. Our mute is
// track.enabled = false, which feeds silence to a normal AnalyserNode — so we
// clone a monitor track that stays enabled and analyse that instead.
const LEVEL_THRESHOLD = 0.06 // peak deviation 0..1
const SUSTAIN_MS = 1000
const TOAST_THROTTLE_MS = 15000

export function useMutedSpeakingWarning() {
  const localStream = useMeetingStore((s) => s.localStream)
  const lastToastRef = useRef(0)

  useEffect(() => {
    if (!localStream) return
    const track = localStream.getAudioTracks()[0]
    if (!track) return

    const monitor = track.clone()
    monitor.enabled = true // stays live even when the real mic is muted
    const monitorStream = new MediaStream([monitor])

    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    let ctx: AudioContext
    try {
      ctx = new AC()
    } catch {
      monitor.stop()
      return
    }
    const source = ctx.createMediaStreamSource(monitorStream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)

    let aboveSince = 0
    const poll = () => {
      analyser.getByteTimeDomainData(data)
      let peak = 0
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i] - 128) / 128
        if (v > peak) peak = v
      }
      const now = Date.now()
      if (useMeetingStore.getState().isAudioMuted && peak > LEVEL_THRESHOLD) {
        if (!aboveSince) aboveSince = now
        else if (now - aboveSince > SUSTAIN_MS && now - lastToastRef.current > TOAST_THROTTLE_MS) {
          lastToastRef.current = now
          useMeetingStore.getState().addToast("You're muted — unmute to talk", 'info')
        }
      } else {
        aboveSince = 0
      }
    }
    const id = setInterval(poll, 200)

    return () => {
      clearInterval(id)
      monitor.stop()
      source.disconnect()
      ctx.close().catch(() => {})
    }
  }, [localStream])
}
