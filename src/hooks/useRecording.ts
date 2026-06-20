import { useCallback, useRef } from 'react'
import { useMeetingStore } from '@/store/meetingStore'

// Fully on-device meeting recording: composite every participant's video into a
// grid on a canvas, mix all audio with WebAudio, feed both to MediaRecorder, and
// download a .webm locally on stop. Nothing is uploaded. Streams are snapshotted
// at start (someone joining mid-recording won't appear) — a documented v1 limit.
export function useRecording() {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const rafRef = useRef<number | null>(null)
  const cleanupRef = useRef<() => void>(() => {})

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
  }, [])

  const startRecording = useCallback(async () => {
    if (typeof MediaRecorder === 'undefined') {
      useMeetingStore.getState().addToast('Recording is not supported in this browser', 'error')
      return
    }
    const state = useMeetingStore.getState()
    const sources: MediaStream[] = []
    if (state.localStream) sources.push(state.localStream)
    Object.values(state.peers).forEach((p) => p.stream && sources.push(p.stream))
    if (!sources.length) {
      state.addToast('Nothing to record yet', 'info')
      return
    }

    // Hidden <video> elements to sample frames from.
    const videos = sources.map((s) => {
      const v = document.createElement('video')
      v.srcObject = s
      v.muted = true
      v.playsInline = true
      v.autoplay = true
      v.play().catch(() => {})
      return v
    })

    const canvas = document.createElement('canvas')
    canvas.width = 1280
    canvas.height = 720
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      videos.forEach((v) => (v.srcObject = null))
      state.addToast('Recording unavailable on this device', 'error')
      return
    }

    const draw = () => {
      const n = videos.length
      const cols = Math.ceil(Math.sqrt(n))
      const rows = Math.ceil(n / cols)
      const cw = canvas.width / cols
      const ch = canvas.height / rows
      ctx.fillStyle = '#0b0e14'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      videos.forEach((v, i) => {
        if (!v.videoWidth) return
        const cx = (i % cols) * cw
        const cy = Math.floor(i / cols) * ch
        // object-fit: cover within the cell
        const vr = v.videoWidth / v.videoHeight
        const cr = cw / ch
        let dw = cw
        let dh = ch
        let dx = cx
        let dy = cy
        if (vr > cr) {
          dh = ch
          dw = ch * vr
          dx = cx - (dw - cw) / 2
        } else {
          dw = cw
          dh = cw / vr
          dy = cy - (dh - ch) / 2
        }
        ctx.save()
        ctx.beginPath()
        ctx.rect(cx, cy, cw, ch)
        ctx.clip()
        ctx.drawImage(v, dx, dy, dw, dh)
        ctx.restore()
      })
      rafRef.current = requestAnimationFrame(draw)
    }
    draw()

    // Mix all audio tracks into one.
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const audioCtx = new AC()
    const dest = audioCtx.createMediaStreamDestination()
    sources.forEach((s) => {
      if (s.getAudioTracks().length) {
        try {
          audioCtx.createMediaStreamSource(s).connect(dest)
        } catch {
          // a stream can only be sourced once per context — ignore dupes
        }
      }
    })

    const canvasStream = canvas.captureStream(15)
    const mixed = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ])

    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm'

    chunksRef.current = []
    const rec = new MediaRecorder(mixed, { mimeType: mime })
    recorderRef.current = rec
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data)
    }
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `alapon-recording-${Date.now()}.webm`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      cleanupRef.current()
    }

    cleanupRef.current = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      videos.forEach((v) => (v.srcObject = null))
      canvasStream.getTracks().forEach((t) => t.stop())
      audioCtx.close().catch(() => {})
      useMeetingStore.getState().setRecording(false)
    }

    try {
      rec.start(1000) // 1s chunks to bound memory
      state.setRecording(true)
    } catch {
      cleanupRef.current()
      state.addToast('Could not start recording', 'error')
    }
  }, [])

  return { startRecording, stopRecording }
}
