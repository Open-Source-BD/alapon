import { useEffect, useRef } from 'react'
import { useMeetingStore } from '@/store/meetingStore'
import { useWebRTC } from '@/hooks/useWebRTC'
import { useActiveSpeaker } from '@/hooks/useActiveSpeaker'
import { VideoGrid } from './VideoGrid'
import { ControlBar } from './ControlBar'
import { ChatPanel } from './SidePanel/ChatPanel'
import { ParticipantsPanel } from './SidePanel/ParticipantsPanel'

export function MeetingRoom() {
  const roomId = useMeetingStore((s) => s.roomId)
  const isChatOpen = useMeetingStore((s) => s.isChatOpen)
  const isParticipantsOpen = useMeetingStore((s) => s.isParticipantsOpen)
  const phase = useMeetingStore((s) => s.phase)

  const setPhase = useMeetingStore((s) => s.setPhase)
  const reset = useMeetingStore((s) => s.reset)

  useWebRTC(roomId)
  useActiveSpeaker()
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (phase !== 'inmeeting') {
      return
    }

    useMeetingStore.getState().setJoinedAt(Date.now())
  }, [phase])

  const handleLeave = async () => {
    try {
      setPhase('left')
      reset()

      leaveTimeoutRef.current = setTimeout(() => {
        window.location.href = '/'
      }, 1000)
    } catch (error) {
      console.error('Failed to leave meeting:', error)
    }
  }

  useEffect(() => {
    return () => {
      if (leaveTimeoutRef.current) {
        clearTimeout(leaveTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <div className="flex-1 flex flex-col">
        <VideoGrid />
        <ControlBar onLeave={handleLeave} />
      </div>

      <div className="w-80 border-l border-gray-700 flex">
        {isChatOpen ? (
          <ChatPanel roomId={roomId} />
        ) : isParticipantsOpen ? (
          <ParticipantsPanel />
        ) : (
          <div className="flex-1 bg-gray-900 flex items-center justify-center border-l border-gray-700">
            <p className="text-gray-500 text-sm">Open chat or participants</p>
          </div>
        )}
      </div>
    </div>
  )
}
