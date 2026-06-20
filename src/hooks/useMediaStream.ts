import { useEffect, useRef } from 'react'
import { useMeetingStore } from '@/store/meetingStore'

export function useMediaStream() {
  const streamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const originalVideoTrackRef = useRef<MediaStreamTrack | null>(null)
  const startedRef = useRef(false)

  const setLocalStream = useMeetingStore((s) => s.setLocalStream)
  const setAudioMuted = useMeetingStore((s) => s.setAudioMuted)
  const setVideoOff = useMeetingStore((s) => s.setVideoOff)
  const setScreenSharing = useMeetingStore((s) => s.setScreenSharing)
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
    if (!streamRef.current) return

    const audioTracks = streamRef.current.getAudioTracks()
    const muted = audioTracks[0]?.enabled === false

    audioTracks.forEach((track) => {
      track.enabled = muted
    })

    setAudioMuted(!muted)
  }

  function toggleVideo(): void {
    if (!streamRef.current) return

    const videoTracks = streamRef.current.getVideoTracks()
    const off = videoTracks[0]?.enabled === false

    videoTracks.forEach((track) => {
      track.enabled = off
    })

    setVideoOff(!off)
  }

  async function startScreenShare(): Promise<void> {
    try {
      if (!streamRef.current) return

      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true as any,
        audio: false,
      })

      const screenTrack = screenStream.getVideoTracks()[0]
      if (!screenTrack) throw new Error('No screen track')

      const originalTrack = streamRef.current.getVideoTracks()[0]
      if (!originalTrack) throw new Error('No video track')

      originalVideoTrackRef.current = originalTrack

      streamRef.current.removeTrack(originalTrack)
      streamRef.current.addTrack(screenTrack)
      screenStreamRef.current = screenStream
      setScreenSharing(true)

      // Handle user stopping share via browser UI
      screenTrack.onended = () => {
        stopScreenShare()
      }
    } catch (error) {
      console.error('Failed to start screen share:', error)
      throw error
    }
  }

  async function stopScreenShare(): Promise<void> {
    try {
      if (!streamRef.current || !originalVideoTrackRef.current) return

      const screenTrack = streamRef.current
        .getVideoTracks()
        .find((t) => screenStreamRef.current?.getTracks().includes(t))

      if (screenTrack) {
        streamRef.current.removeTrack(screenTrack)
        screenTrack.stop()
      }

      screenStreamRef.current?.getTracks().forEach((t) => t.stop())
      screenStreamRef.current = null

      streamRef.current.addTrack(originalVideoTrackRef.current)
      originalVideoTrackRef.current = null
      setScreenSharing(false)
    } catch (error) {
      console.error('Failed to stop screen share:', error)
      throw error
    }
  }

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
    startScreenShare,
    stopScreenShare,
    getDevices,
  }
}
