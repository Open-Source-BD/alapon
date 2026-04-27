import { useEffect, useRef } from 'react'
import { useMeetingStore } from '@/store/meetingStore'

export function useMediaStream() {
  const streamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const originalVideoTrackRef = useRef<MediaStreamVideoTrack | null>(null)

  const setLocalStream = useMeetingStore((s) => s.setLocalStream)
  const setAudioMuted = useMeetingStore((s) => s.setAudioMuted)
  const setVideoOff = useMeetingStore((s) => s.setVideoOff)
  const setScreenSharing = useMeetingStore((s) => s.setScreenSharing)
  const isAudioMuted = useMeetingStore((s) => s.isAudioMuted)
  const isVideoOff = useMeetingStore((s) => s.isVideoOff)

  async function startMedia(): Promise<void> {
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
        video: { cursor: 'always' },
        audio: false,
      })

      const screenTrack = screenStream.getVideoTracks()[0]
      if (!screenTrack) throw new Error('No screen track')

      originalVideoTrackRef.current = streamRef.current
        .getVideoTracks()[0] as MediaStreamVideoTrack

      streamRef.current.removeTrack(originalVideoTrackRef.current)
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMedia()
      stopScreenShare()
    }
  }, [])

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
