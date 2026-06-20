import { useEffect, useRef } from 'react'
import { useMeetingStore } from '@/store/meetingStore'

export function useMediaStream() {
  const streamRef = useRef<MediaStream | null>(null)
  const startedRef = useRef(false)

  const setLocalStream = useMeetingStore((s) => s.setLocalStream)
  const setAudioMuted = useMeetingStore((s) => s.setAudioMuted)
  const setVideoOff = useMeetingStore((s) => s.setVideoOff)
  const isAudioMuted = useMeetingStore((s) => s.isAudioMuted)
  const isVideoOff = useMeetingStore((s) => s.isVideoOff)
  const localStream = useMeetingStore((s) => s.localStream)

  async function startMedia(): Promise<void> {
    // Idempotent: if this instance already acquired (or is acquiring) media,
    // don't call getUserMedia again. Without this, a caller whose effect re-runs
    // (e.g. PreJoinScreen) would repeatedly re-acquire the camera and swap the
    // <video> srcObject, which shows up as flicker. Set the flag synchronously
    // so concurrent re-entries before the first await also bail.
    if (startedRef.current) return
    startedRef.current = true

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
      })

      streamRef.current = stream
      setLocalStream(stream)

      // Apply initial mute/off states
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !isAudioMuted
      })
      stream.getVideoTracks().forEach((track) => {
        track.enabled = !isVideoOff
      })
    } catch (error) {
      // Allow a later retry (e.g. after the user grants permission).
      startedRef.current = false
      console.error('Failed to get user media:', error)
      throw error
    }
  }

  // Re-acquire the camera/mic with specific devices (used by the PreJoin device
  // picker). Stops the current tracks first, then swaps in the new stream. If a
  // meeting is already live, useWebRTC's localStream effect replaces the sent
  // tracks on every peer connection.
  async function switchDevices(opts: {
    audioDeviceId?: string
    videoDeviceId?: string
  }): Promise<void> {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: opts.audioDeviceId
          ? { deviceId: { exact: opts.audioDeviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
          : { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: opts.videoDeviceId
          ? { deviceId: { exact: opts.videoDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      })
      streamRef.current = stream
      startedRef.current = true
      setLocalStream(stream)
      stream.getAudioTracks().forEach((t) => { t.enabled = !isAudioMuted })
      stream.getVideoTracks().forEach((t) => { t.enabled = !isVideoOff })
    } catch (error) {
      console.error('Failed to switch devices:', error)
      throw error
    }
  }

  function stopMedia(): void {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setLocalStream(null)
    }
    // Reset so a remount can re-acquire (matters for React StrictMode's
    // mount→unmount→mount cycle in dev, and for explicit restarts).
    startedRef.current = false
  }

  function toggleAudio(): void {
    // Read the stream from the store, not this instance's ref. useMediaStream is
    // mounted in several components (PreJoin, MeetingRoom, ControlBar); the
    // ControlBar copy may never have re-attached its ref, which previously made
    // the mic button a silent no-op. The store stream is the single source.
    const stream = streamRef.current ?? useMeetingStore.getState().localStream
    if (!stream) return

    const next = !useMeetingStore.getState().isAudioMuted // next muted state
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !next
    })
    setAudioMuted(next)
  }

  function toggleVideo(): void {
    const stream = streamRef.current ?? useMeetingStore.getState().localStream
    if (!stream) return

    const next = !useMeetingStore.getState().isVideoOff // next video-off state
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !next
    })
    setVideoOff(next)
  }

  // NOTE: screen sharing lives in useWebRTC — it owns the peer senders (replaceTrack)
  // and the data channel (the 'presenting' signal). Doing it here only mutated the
  // local stream and never reached the peers, so remote users saw the camera.

  async function getDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter((d) => d.kind === 'audioinput')
      const videoInputs = devices.filter((d) => d.kind === 'videoinput')
      return { audioInputs, videoInputs }
    } catch (error) {
      console.error('Failed to enumerate devices:', error)
      return { audioInputs: [], videoInputs: [] }
    }
  }

  // Re-attach to existing stream if already started by another instance
  useEffect(() => {
    if (!streamRef.current && localStream && !startedRef.current) {
      streamRef.current = localStream
    }
  }, [localStream])

  // NOTE: deliberately no stop-on-unmount here. The local stream is a session
  // resource shared across PreJoinScreen, MeetingRoom and ControlBar via the
  // store. Stopping it when PreJoinScreen unmounts (navigating into the meeting)
  // would kill the camera tracks before the meeting starts, leaving the local
  // user with no video. Teardown happens explicitly on leave (handleLeave ->
  // stopMedia) and the browser stops tracks on tab close.

  return {
    startMedia,
    stopMedia,
    toggleAudio,
    toggleVideo,
    switchDevices,
    getDevices,
  }
}
